// linear-custom-import.js
// Author: Bryan Nelson
// Date: 2024-06-12
// Description: A custom script to import issues into Linear from CSV files with user-defined mapping.
// Created using Gemini 3 Thinking
//
// Install dependencies before running: 
//  npm install @linear/sdk csv-parser inquirer glob
//
// Run the script with:
//  node linear-custom-import.js


const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { LinearClient } = require('@linear/sdk');
const glob = require('glob');

// --- CONFIGURATION ---
const HARDCODED_API_KEY = ""; // Optionally set your Linear API key here for convenience

async function main() {
  // Dynamic import for ESM compatibility
  const { default: inquirer } = await import('inquirer');

  console.log("🚀 Starting Custom Linear CSV Importer (Debug Mode)...\n");

  // 1. API Key Setup
  let apiKey = HARDCODED_API_KEY;
  if (!apiKey) {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Linear API Key:',
        validate: input => input.startsWith('lin_api_') ? true : 'Invalid key format. Must start with "lin_api_"'
      }
    ]);
    apiKey = answers.apiKey;
  }

  const linearClient = new LinearClient({ apiKey });
  let viewer;

  try {
    viewer = await linearClient.viewer;
    console.log(`✅ Connected as: ${viewer.name}`);
  } catch (error) {
    console.error("❌ Failed to connect. Check your API Key.");
    process.exit(1);
  }

  // 2. Find CSV Files
  console.log("\n🔍 Scanning for CSV files...");
  const csvFiles = glob.sync('**/*.csv', { ignore: ['node_modules/**', '.*/**'] });

  if (csvFiles.length === 0) {
    console.error("❌ No CSV files found.");
    process.exit(1);
  }

  // SWITCHED TO RAWLIST: Type the number instead of using arrow keys
  const fileSelection = await inquirer.prompt([
    {
      type: 'rawlist',
      name: 'filePath',
      message: 'Select the CSV file to import (Type the number):',
      choices: csvFiles
    }
  ]);

  // 3. Select Team
  console.log("\nFetching teams...");
  const teams = await linearClient.teams();
  
  if (teams.nodes.length === 0) {
      console.error("❌ No teams found in this Linear workspace.");
      process.exit(1);
  }

  // Create choice objects
  const teamChoices = teams.nodes.map(t => ({ 
      name: `[${t.key}] ${t.name}`, 
      value: t.id 
  }));

  // SWITCHED TO RAWLIST for stability
  const teamSelection = await inquirer.prompt([
    {
      type: 'rawlist',
      name: 'teamId',
      message: 'Import issues into which Team? (Type the number):',
      choices: teamChoices
    }
  ]);

  // --- DEBUG & VALIDATION ---
  let targetTeamId = teamSelection.teamId;
  
  // Regex to verify if we actually got a UUID
  const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;
  
  if (!uuidRegex.test(targetTeamId)) {
      console.log(`\n⚠️  Warning: Selection "${targetTeamId}" does not look like a UUID.`);
      console.log("   Attempting to find team by name match...");
      
      // Try to find the team object that matches the selection string
      const matchedTeam = teams.nodes.find(t => 
          t.name === targetTeamId || 
          t.key === targetTeamId ||
          `[${t.key}] ${t.name}` === targetTeamId
      );

      if (matchedTeam) {
          targetTeamId = matchedTeam.id;
          console.log(`✅ Resolved to Team ID: ${targetTeamId}`);
      } else {
          console.error(`❌ Critical Error: Could not resolve a Team ID from selection "${targetTeamId}".`);
          console.error("   Please check your selection and try again.");
          process.exit(1);
      }
  } else {
      console.log(`✅ Using Team ID: ${targetTeamId}`);
  }

  // 4. PRE-FETCH States and Labels for Mapping
  console.log(`\n⚙️  Fetching Workflow States & Labels...`);
  
  const workflowStates = await linearClient.workflowStates({ 
    filter: { team: { id: { eq: targetTeamId } } } 
  });
  
  const statusMap = {};
  workflowStates.nodes.forEach(state => {
    statusMap[state.name.toLowerCase()] = state.id;
  });

  const issueLabels = await linearClient.issueLabels(); 
  const labelMap = {};
  issueLabels.nodes.forEach(label => {
    labelMap[label.name.toLowerCase()] = label.id;
  });

  console.log(`   Mapped ${Object.keys(statusMap).length} statuses and ${Object.keys(labelMap).length} labels.`);

  // 5. Confirmation
  const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'go',
      message: `Ready to import from "${fileSelection.filePath}"?`,
      default: false
  }]);

  if (!confirm.go) process.exit(0);

  // 6. Process CSV
  const results = [];
  fs.createReadStream(fileSelection.filePath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`\n🚀 Importing ${results.length} rows...`);
      
      let successCount = 0;
      let failCount = 0;

      for (const row of results) {
        const title = row['Title'] || 'Untitled Issue';
        const description = row['Description'] || '';
        
        // Priority Logic
        let priority = 0;
        if (row['Priority']) priority = parseInt(row['Priority']) || 0;

        // Estimate Logic
        let estimate = undefined;
        if (row['Estimate']) estimate = parseInt(row['Estimate']);

        // Status Logic
        let stateId = undefined;
        if (row['Status']) {
            const statusName = row['Status'].trim().toLowerCase();
            stateId = statusMap[statusName];
        }

        // Label Logic
        let labelIds = [];
        if (row['Labels']) {
            const labelNames = row['Labels'].split(',').map(s => s.trim().toLowerCase());
            labelNames.forEach(name => {
                if (labelMap[name]) {
                    labelIds.push(labelMap[name]);
                }
            });
        }

        try {
          // Create issue and capture the response payload
          const issuePayload = await linearClient.createIssue({
            teamId: targetTeamId,
            title: title,
            description: description,
            priority: priority,
            estimate: estimate,
            stateId: stateId,
            labelIds: labelIds.length > 0 ? labelIds : undefined
          });
          
          // Fetch the actual issue object to get the URL
          const issue = await issuePayload.issue;
          if (issue) {
              const issueUrl = await issue.url;
              console.log(`\n✅ Created: "${title}" -> ${issueUrl}`);
              successCount++;
          } else {
              // Fallback if issue fetch fails (unlikely)
              console.log(`\n✅ Created: "${title}" (ID: ${issuePayload.id})`);
              successCount++;
          }

        } catch (err) {
          console.error(`\n❌ Failed: "${title}" - ${err.message}`);
          failCount++;
        }
      }

      console.log(`\n\n🎉 Done! Success: ${successCount}, Failed: ${failCount}`);
    });
}

main().catch(console.error);