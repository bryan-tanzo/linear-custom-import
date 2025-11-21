# Linear Custom Import

Custom CSV-to-Linear importer built to replace the `linear-import` module when it failed to meet our needs. The script walks you through selecting a CSV, choosing a team, mapping statuses and labels automatically, and creating issues with clear success/failure output.

## Why This Exists
- The public `linear-import` module was unreliable for our workspace and CSV layout.
- This script is a single-file, zero-config alternative that still pulls workflow states/labels from your Linear workspace and validates selections before creating issues.

## Prerequisites
- Node.js 18+ (ESM dynamic imports are used for Inquirer).
- Linear API key with permissions to create issues.
- Dependencies: `@linear/sdk`, `csv-parser`, `inquirer`, `glob`.

Install dependencies in this folder:
```bash
npm install @linear/sdk csv-parser inquirer glob
```

## Usage
1) Place one or more CSV files in this folder (or subfolders). The script scans `**/*.csv` and ignores `node_modules` and dotfolders.  
2) Run the importer:
```bash
node linear-custom-import.js
```
3) Steps you will see:
   - API key prompt (unless you hardcode it in `HARDCODED_API_KEY`).  
   - CSV file selection (numbered list).  
   - Team selection (numbered list using team names/keys).  
   - Automatic fetch of workflow states and labels for mapping.  
   - Final confirmation before import.  
4) Each issue creation logs either the new issue URL or the error message. A summary shows successes vs. failures.

## CSV Format
The parser uses column headers (case-sensitive). Acceptable columns:
- `Title` (required): Issue title.
- `Description` (optional): Markdown/plaintext description.
- `Priority` (optional): Integer priority value.
- `Estimate` (optional): Integer estimate.
- `Status` (optional): Matches a Linear workflow state name (case-insensitive).
- `Labels` (optional): Comma-separated list; each label must exist in Linear (case-insensitive).

Example: `sample-issues.csv`
```csv
Title,Description,Priority
"Fix login bug","Users cannot login with Google auth",1
"Update homepage copy","Marketing team requested new headers",3
"Refactor backend API","Clean up the user controller",2
```

## Notes on API Keys
- The script includes `HARDCODED_API_KEY` as a convenience. Replace it with your own or clear it to be prompted securely.
- Do not commit real API keys. Consider using environment variables or a `.env` loader if you extend the script.

## Common Issues
- **No teams found**: Ensure the API key is scoped to the correct workspace.
- **Status/label not applied**: The name in CSV must match an existing workflow state/label (case-insensitive). Unknown values are skipped safely.
- **No CSV files found**: Place your CSV in this directory (or subdirectories) before running.

## Project Files
- `linear-custom-import.js` — the importer script.
- `sample-issues.csv` — starter CSV you can copy and edit for your data.
- `LICENSE` — MIT License.
