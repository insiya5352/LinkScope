# LinkScope — Web Page Link/Authority Mining

A beginner-friendly Flask + NetworkX project for analyzing directed hyperlink datasets. It calculates PageRank, HITS authority/hub scores, and in-degree/out-degree metrics, then displays the results in an interactive dashboard.

## Features

- Upload a CSV with `source,target` columns or use the built-in sample.
- Validates blank values, missing columns, duplicate links, and file type.
- Builds a directed NetworkX graph and preserves all observed source/target pages.
- Computes PageRank, HITS authority and hub scores, and in/out degree.
- Interactive network graph, metric comparison chart, searchable/sortable ranking table.
- Export calculated results to CSV.
- Responsive layout and a 5 MB upload limit.

## Requirements

- Python 3.10 or newer recommended.
- Internet connection for the Google Font, Plotly.js, and vis-network CDN assets. The Flask analysis backend itself does not use paid APIs or API keys.

## Run in VS Code

### 1. Open the project folder

Unzip `link-authority-mining.zip`, then open the extracted `link-authority-mining` folder in VS Code.

### 2. Create a virtual environment

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell**
```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use Command Prompt:
```bat
.venv\Scripts\activate.bat
```

### 3. Install packages

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Start the website

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser. Keep the terminal running while using the site. Press `Ctrl+C` in the terminal to stop it.

## CSV format

The file must have a header row named `source,target`. Each row represents one directed link from a page to another page:

```csv
source,target
Home,Research
Research,PageRank
PageRank,Home
```

Page names can be plain identifiers or URLs. They are treated as strings. Repeated source-target pairs are removed. Blank rows are ignored; if no valid links remain, the app shows an error. A page with no outgoing links is preserved if it appears as a target.

## Using the dashboard

1. Select **Use sample dataset** or upload your CSV.
2. Choose PageRank, HITS, or In-degree in the algorithm menu.
3. Click **Run analysis**.
4. Review the graph statistics, ranking table, authority chart, and network graph.
5. Change the chart metric or network node-size metric to explore another score. Use the table search, minimum in-degree filter, or sortable headings.
6. Select **Export results** to save the computed metrics and independent ranking positions as a CSV.

The chart and network visualization libraries are loaded from CDNs, so they need internet access to display. Data processing occurs locally in your Flask application.

## Methodology

1. **Input validation:** load the CSV and keep non-empty source/target pairs.
2. **Graph construction:** create a directed graph, with pages as nodes and hyperlinks as edges.
3. **Metric calculation:** compute PageRank, HITS authority/hub, in-degree, and out-degree using NetworkX.
4. **Ranking:** sort by the selected algorithm and calculate separate ranks for each metric.
5. **Visualization:** present graph statistics, rankings, and interactive charts.

### What the algorithms mean

- **PageRank:** estimates structural importance by considering incoming links and the importance of pages that link to a page. The damping factor used here is 0.85.
- **HITS:** calculates **authority** scores for pages linked by strong hubs and **hub** scores for pages that point to strong authorities.
- **In-degree:** counts direct incoming links. It is a simple baseline and does not account for the importance of linking pages.
- **Out-degree:** counts the number of unique links a page sends to other pages.

These scores describe the graph supplied to the application. They do not prove factual accuracy, credibility, or trustworthiness. This is a learning project, not a reproduction of Google's complete ranking system.

## Troubleshooting

- **`python` command not found:** on macOS try `python3`; on Windows try `py`.
- **`No module named flask/networkx/pandas`:** activate `.venv` and run `python -m pip install -r requirements.txt`.
- **Port 5000 already in use:** stop the other process or change the last line in `app.py` to `app.run(debug=True, port=5001)`, then open `http://127.0.0.1:5001`.
- **PowerShell activation denied:** use Command Prompt activation or adjust the execution policy according to your institution's computer policy.
- **Charts or network graph are blank:** check your internet connection because Plotly.js and vis-network are loaded from CDNs. The Flask backend and CSV processing are still local.
- **CSV validation error:** confirm the first row contains `source,target`, both columns have values, and the file is saved as a CSV rather than Excel `.xlsx`.

## Project structure

```text
link-authority-mining/
├── app.py
├── requirements.txt
├── README.md
├── data/
│   └── sample_links.csv
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```
