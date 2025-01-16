/**
 * server.js
 */
const express = require("express");
const { OBSWebSocket } = require("obs-websocket-js");

const app = express();
const port = 3000;

// 1. The OBS machine info
const OBS_HOST = "ws://strih.lan:4456"; 
// If OBS is on another PC, e.g. "ws://192.168.0.10:4455"

// 2. If you have a password, put it here. Otherwise, leave it blank.
const OBS_PASSWORD = "";

// 3. The filter name (Render Delay)
const FILTER_NAME = "Render Delay";

// 4. The camera source names (adjust these to match your actual sources)
const cameraSources = [
  "01 input",
  "02 input",
  "03 input",
  "04 input",
  "05 input",
  "06 input",
  "07 input",
  "08 input"
];

// Create an OBSWebSocket instance
const obs = new OBSWebSocket();

// Connect to OBS on startup
obs.connect(OBS_HOST, OBS_PASSWORD)
  .then(() => {
    console.log("Connected to OBS via obs-websocket.");
  })
  .catch((err) => {
    console.error("Failed to connect to OBS:", err);
  });

// Middleware to handle JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------------------------------
// GET / : Show a 2-column layout (4 rows × 2 columns = 8 cameras)
// --------------------------------------------------------------------------
app.get("/", async (req, res) => {
  try {
    // 1. Get the current camera delays (same as your existing code)
    const cameraDelays = await fetchCameraDelays();

    // 2. Build the table rows (same logic you already have for 2 columns)
    let tableRows = "";
    for (let i = 0; i < cameraDelays.length; i += 2) {
      const cam1 = cameraDelays[i];
      const cam2 = cameraDelays[i + 1];

      const col1 = cam1 ? buildCameraCell(cam1) : "";
      const col2 = cam2 ? buildCameraCell(cam2) : "";

      tableRows += `
        <tr>
          <td>${col1}</td>
          <td>${col2}</td>
        </tr>
      `;
    }

    // 3. Here is the updated HTML with custom <style> for a wider table
    const html = `
      <html>
      <head>
        <meta charset="utf-8">
        <title>OBS Render Delay Control</title>
        <style>
          /* Make the table fill most of the window width */
          table {
            width: 90%;
            margin: 0 auto;       /* center the table */
            border-collapse: collapse;
          }
          /* Force each of the 2 columns to take up 50% of the width */
          td {
            width: 50%;
            vertical-align: top;  /* align content at the top */
            padding: 16px;        /* spacing inside each cell */
          }
          /* You can tweak these further as you like */
          h3 {
            margin: 0 0 8px 0; 
          }
        </style>
      </head>
      <body>
        <h1>OBS Render Delay Control (2 Columns, 8 Cameras)</h1>
        <table border="1">
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    // 4. Send the response
    res.send(html);
  } catch (error) {
    console.error("Error generating page:", error);
    res.status(500).send("Error generating page.");
  }
});

// --------------------------------------------------------------------------
// Helper to build the HTML cell for one camera (name + current delay + form)
// --------------------------------------------------------------------------
function buildCameraCell({ cameraName, delay }) {
  // If delay is -1, it means we failed to get the filter
  const displayDelay = delay >= 0 ? `${delay} ms` : "(Error)";

  return `
    <h3>${cameraName}</h3>
    <p><strong>Current Delay:</strong> ${displayDelay}</p>
    <form action="/update-delay" method="POST">
      <input type="hidden" name="cameraName" value="${cameraName}" />
      <label>New Delay (ms): 
        <input type="number" name="newDelay" value="${delay >= 0 ? delay : 0}" style="width:80px;" />
      </label>
      <button type="submit">Update</button>
    </form>
  `;
}

// --------------------------------------------------------------------------
// GET /api/cameras : Returns JSON data about each camera's current delay
// --------------------------------------------------------------------------
app.get("/api/cameras", async (req, res) => {
  try {
    const cameraDelays = await fetchCameraDelays();
    res.json(cameraDelays);
  } catch (error) {
    console.error("Failed to fetch camera delays:", error);
    res.status(500).json({ error: "Failed to fetch camera delays." });
  }
});

// --------------------------------------------------------------------------
// POST /api/cameras : Expects { cameraName: string, delay: number }
// --------------------------------------------------------------------------
app.post("/api/cameras", async (req, res) => {
  const { cameraName, delay } = req.body;

  if (!cameraName || delay === undefined) {
    return res.status(400).json({ error: "Missing cameraName or delay." });
  }

  try {
    await setRenderDelay(cameraName, Number(delay));
    res.json({ success: true, cameraName, delay });
  } catch (error) {
    console.error("Failed to set camera delay:", error);
    res.status(500).json({ error: "Failed to set camera delay." });
  }
});

// --------------------------------------------------------------------------
// POST /update-delay : A simple form handler to set the new delay
// --------------------------------------------------------------------------
app.post("/update-delay", async (req, res) => {
  const { cameraName, newDelay } = req.body;

  if (!cameraName || newDelay === undefined) {
    return res.status(400).send("Missing cameraName or newDelay.");
  }

  try {
    await setRenderDelay(cameraName, Number(newDelay));
    res.redirect("/");
  } catch (error) {
    console.error("Failed to set camera delay:", error);
    res.status(500).send("Failed to set camera delay.");
  }
});

// --------------------------------------------------------------------------
// Helper: fetchCameraDelays()
// Loops over cameraSources, calls "GetSourceFilter"
// --------------------------------------------------------------------------
async function fetchCameraDelays() {
  const promises = cameraSources.map(async (cameraName) => {
    try {
      const resp = await obs.call("GetSourceFilter", {
        sourceName: cameraName,
        filterName: FILTER_NAME
      });
      const delay = resp.filterSettings.delay_ms;
      return { cameraName, delay };
    } catch (error) {
      console.warn(`Could not get filter for ${cameraName}: ${error.message}`);
      // Use -1 to indicate an error or missing filter
      return { cameraName, delay: -1 };
    }
  });

  return Promise.all(promises);
}

// --------------------------------------------------------------------------
// Helper: setRenderDelay(cameraName, delayMs)
// Calls "SetSourceFilterSettings" for the given camera
// --------------------------------------------------------------------------
async function setRenderDelay(cameraName, delayMs) {
  // If the delay is negative, you might want to handle that differently
  await obs.call("SetSourceFilterSettings", {
    sourceName: cameraName,
    filterName: FILTER_NAME,
    filterSettings: {
      delay_ms: delayMs
    }
  });
}

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
