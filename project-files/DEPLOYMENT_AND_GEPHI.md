# Deployment and Gephi steps

## A. Put the website on GitHub

Create a new repository, for example `same-campus-unequal-beginnings`.

If the `site` folder is your local project folder:

```bash
cd site
git init
git add .
git commit -m "Initial DH project website"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/same-campus-unequal-beginnings.git
git push -u origin main
```

## B. Deploy that repository to Vercel

1. Sign in to Vercel.
2. Select **Add New → Project**.
3. Import the GitHub repository.
4. Set **Framework Preset** to **Other**.
5. Leave **Build Command** blank.
6. Keep **Root Directory** as `./` if `index.html` is in the repository root.
7. Click **Deploy**.
8. Open the generated `vercel.app` URL and test the network filters and charts.

For a plain HTML/CSS/JS project, Vercel documents that a build step is not required; Git-connected projects automatically redeploy when the tracked production branch is updated.

## C. Run locally before deploying

```bash
cd site
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## D. Gephi workflow for a screenshot / additional DH evidence

Use the two files in the project root:

- `network_nodes.csv`
- `network_edges.csv`

### Import nodes
1. Open Gephi → New Project.
2. Data Laboratory → Import Spreadsheet.
3. Choose `network_nodes.csv`.
4. Import as **Nodes table**.
5. Confirm `id` is treated as the node ID.

### Import edges
1. Import Spreadsheet again.
2. Choose `network_edges.csv`.
3. Import as **Edges table**.
4. Use `source` and `target` as endpoints and `weight` as edge weight.
5. Choose an **undirected** network for this participation model.

### Layout
1. Go to Overview.
2. Run ForceAtlas 2.
3. Turn on Prevent Overlap if needed.
4. Size nodes by degree.
5. Colour student nodes using `region_type`.
6. Keep activity nodes visibly larger or label them.

### Screenshot to capture
Take one clean Gephi screenshot showing:
- the whole network,
- the ten activity hubs,
- student clusters/bridges,
- the colour legend if visible,
- no side panels covering the graph if possible.

Use that screenshot in the report slot labelled **Figure: Gephi participation network**.
