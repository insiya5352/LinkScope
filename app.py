from flask import Flask, render_template, request, jsonify, send_file, Response
import pandas as pd
import networkx as nx
from io import BytesIO, StringIO
from pathlib import Path
import csv

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB upload limit
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAMPLE_PATH = DATA_DIR / "sample_links.csv"
ALLOWED_EXTENSIONS = {"csv"}

def load_links_from_frame(df):
    """Validate a dataframe and return a cleaned source/target dataframe."""
    if df is None or df.empty:
        raise ValueError("The CSV is empty. Add at least one source-to-target link.")
    # Column matching is case-insensitive and ignores surrounding whitespace.
    normalized = {str(c).strip().lower(): c for c in df.columns}
    if "source" not in normalized or "target" not in normalized:
        raise ValueError("CSV must contain exactly the required columns: source and target.")
    clean = df[[normalized["source"], normalized["target"]]].copy()
    clean.columns = ["source", "target"]
    clean = clean.dropna(subset=["source", "target"])
    clean["source"] = clean["source"].astype(str).str.strip()
    clean["target"] = clean["target"].astype(str).str.strip()
    clean = clean[(clean["source"] != "") & (clean["target"] != "")]
    if clean.empty:
        raise ValueError("No valid links found. Each row needs a non-blank source and target.")
    original_count = len(clean)
    clean = clean.drop_duplicates(subset=["source", "target"]).reset_index(drop=True)
    return clean, original_count - len(clean)

def analyze_links(df, algorithm="pagerank"):
    clean, duplicates_removed = load_links_from_frame(df)
    graph = nx.DiGraph()
    # Add all observed pages first; this preserves pages with no outgoing links.
    pages = pd.unique(pd.concat([clean["source"], clean["target"]], ignore_index=True)).tolist()
    graph.add_nodes_from(pages)
    graph.add_edges_from(clean[["source", "target"]].itertuples(index=False, name=None))
    try:
        pagerank = nx.pagerank(graph, alpha=0.85, max_iter=200, tol=1e-10)
    except nx.PowerIterationFailedConvergence:
        pagerank = {node: 1 / max(graph.number_of_nodes(), 1) for node in graph.nodes}
    try:
        hubs, authorities = nx.hits(graph, max_iter=500, tol=1e-10, normalized=True)
    except (nx.PowerIterationFailedConvergence, ZeroDivisionError):
        hubs = {node: 0.0 for node in graph.nodes}
        authorities = {node: 0.0 for node in graph.nodes}

    rows = []
    for node in graph.nodes:
        rows.append({
            "page": str(node),
            "in_degree": int(graph.in_degree(node)),
            "out_degree": int(graph.out_degree(node)),
            "pagerank": float(pagerank.get(node, 0.0)),
            "authority": float(authorities.get(node, 0.0)),
            "hub": float(hubs.get(node, 0.0)),
        })
    metric_by_algorithm = {
        "pagerank": "pagerank",
        "hits": "authority",
        "indegree": "in_degree",
    }
    if algorithm not in metric_by_algorithm:
        raise ValueError("Choose PageRank, HITS, or in-degree ranking.")
    active_metric = metric_by_algorithm[algorithm]
    rows.sort(key=lambda r: (-r[active_metric], r["page"].casefold()))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    # Independent ranks make the comparison useful regardless of selected algorithm.
    for metric, rank_name in [("pagerank", "pagerank_rank"), ("authority", "authority_rank"),
                              ("hub", "hub_rank"), ("in_degree", "indegree_rank")]:
        ordered = sorted(rows, key=lambda r: (-r[metric], r["page"].casefold()))
        ranks = {r["page"]: i for i, r in enumerate(ordered, start=1)}
        for row in rows:
            row[rank_name] = ranks[row["page"]]
    n, m = graph.number_of_nodes(), graph.number_of_edges()
    indegrees = [graph.in_degree(node) for node in graph.nodes]
    top = rows[0] if rows else None
    return {
        "algorithm": algorithm,
        "algorithm_label": {"pagerank": "PageRank", "hits": "HITS Authority", "indegree": "In-degree"}[algorithm],
        "stats": {
            "nodes": n, "edges": m,
            "average_in_degree": round(sum(indegrees) / n, 4) if n else 0,
            "density": round(nx.density(graph), 4) if n > 1 else 0,
            "top_page": top["page"] if top else "—",
            "top_score": top[active_metric] if top else 0,
            "duplicates_removed": int(duplicates_removed),
            "self_links": sum(1 for u, v in graph.edges if u == v),
        },
        "active_metric": active_metric,
        "results": rows,
        "nodes": [{
            "id": str(node), "label": str(node),
            "in_degree": int(graph.in_degree(node)), "out_degree": int(graph.out_degree(node)),
            "pagerank": float(pagerank.get(node, 0)), "authority": float(authorities.get(node, 0)),
            "hub": float(hubs.get(node, 0))
        } for node in graph.nodes],
        "edges": [{"source": str(u), "target": str(v)} for u, v in graph.edges],
        "preview": clean.head(12).to_dict(orient="records"),
        "preview_count": len(clean),
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/sample", methods=["GET"])
def sample():
    try:
        df = pd.read_csv(SAMPLE_PATH, dtype=str, keep_default_na=False)
        clean, _ = load_links_from_frame(df)
        return jsonify({"ok": True, "rows": clean.head(12).to_dict(orient="records"),
                        "total_rows": len(clean), "columns": ["source", "target"]})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        algorithm = request.form.get("algorithm", "pagerank").strip().lower()
        if algorithm not in {"pagerank", "hits", "indegree"}:
            return jsonify({"ok": False, "error": "Unsupported algorithm selection."}), 400
        if "file" in request.files and request.files["file"].filename:
            uploaded = request.files["file"]
            if Path(uploaded.filename).suffix.lower() not in {".csv"}:
                return jsonify({"ok": False, "error": "Please upload a .csv file."}), 400
            try:
                df = pd.read_csv(uploaded, dtype=str, keep_default_na=False)
            except (pd.errors.ParserError, UnicodeDecodeError, pd.errors.EmptyDataError):
                return jsonify({"ok": False, "error": "Could not read this CSV. Check its encoding and formatting."}), 400
        elif request.form.get("use_sample") == "true":
            df = pd.read_csv(SAMPLE_PATH, dtype=str, keep_default_na=False)
        else:
            return jsonify({"ok": False, "error": "Upload a CSV file or choose the sample dataset first."}), 400
        result = analyze_links(df, algorithm)
        return jsonify({"ok": True, **result})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Analysis failed")
        return jsonify({"ok": False, "error": "Analysis could not be completed. Check the dataset and try again."}), 500

@app.route("/api/sample.csv")
def download_sample():
    return send_file(SAMPLE_PATH, mimetype="text/csv", as_attachment=True, download_name="sample_links.csv")

@app.route("/api/export", methods=["POST"])
def export_results():
    payload = request.get_json(silent=True) or {}
    rows = payload.get("results", [])
    if not isinstance(rows, list) or not rows:
        return jsonify({"ok": False, "error": "Run an analysis before exporting results."}), 400
    allowed = ["rank", "page", "in_degree", "out_degree", "pagerank", "authority", "hub",
               "pagerank_rank", "authority_rank", "hub_rank", "indegree_rank"]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=allowed, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in allowed})
    memory = BytesIO(output.getvalue().encode("utf-8-sig"))
    memory.seek(0)
    return send_file(memory, mimetype="text/csv", as_attachment=True, download_name="link_authority_results.csv")

@app.errorhandler(413)
def too_large(_error):
    return jsonify({"ok": False, "error": "File is too large. Please keep CSV uploads under 5 MB."}), 413

if __name__ == "__main__":
    DATA_DIR.mkdir(exist_ok=True)
    app.run(debug=True)
