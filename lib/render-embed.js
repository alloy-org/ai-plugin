import { POLLING_INTERVAL_EMBED_MILLISECONDS } from "constants/search-settings"

const INITIAL_POLLING_DELAY = 100;
const PROGRESS_BAR_HEIGHT_PIXELS = 60;

// --------------------------------------------------------------------------
// Renders an HTML embed that polls for progress updates from the plugin.
// The embed uses window.callAmplenotePlugin to fetch the latest progress text
// from the plugin's onEmbedCall handler, enabling real-time updates without
// requiring page navigation.
//
// @param {object} app - Amplenote app object (unused but required by plugin API)
// @param {object} plugin - Plugin instance containing progressText
// @param {Array} renderArguments - Arguments passed when opening the embed
// @returns {string} HTML string for the embed iframe
export default function renderPluginEmbed(app, plugin, renderArguments) {
  const initialContent = plugin.progressText || "Loading...";
  const initialPercentage = plugin.progressPercentage() || 0;

  return `
    <html lang="en">
      <head>
        <style>
          body {
            background-color: #fff;
            color: #333;
            padding: 10px;
            margin: 0;
          }
          
          .progress-bar-container {
            width: 100%;
            max-width: 600px;
            height: ${ PROGRESS_BAR_HEIGHT_PIXELS }px;
            margin: 0 auto 20px auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          
          .progress-bar-wrapper {
            width: 100%;
            height: 12px;
            background: linear-gradient(to right, #e8eaed, #f1f3f4);
            border-radius: 6px;
            overflow: hidden;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #4285f4, #34a853);
            border-radius: 6px;
            transition: width 0.4s ease-out;
            box-shadow: 0 1px 2px rgba(66, 133, 244, 0.3);
          }
          
          .progress-percentage-text {
            margin-top: 8px;
            font-family: "Roboto Mono", monospace;
            font-size: 14px;
            font-weight: 500;
            color: #5f6368;
          }
          
          .plugin-embed-container {
            font-family: "Roboto", sans-serif;
            line-height: 1.5;
          }
          
          .plugin-embed-container a {
            color: #1a73e8;
            text-decoration: none;
          }
          
          .plugin-embed-container a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="progress-bar-container">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" id="progress-bar-fill" style="width: ${ initialPercentage }%"></div>
          </div>
          <div class="progress-percentage-text" id="progress-percentage-text">${ initialPercentage }% complete</div>
        </div>
        <div class="plugin-embed-container" 
          id="progress-content"
          data-args="${ typeof(renderArguments) === "object" ? JSON.stringify(renderArguments) : renderArguments }" 
          data-rendered-at="${ new Date().toISOString() }"
        >
          ${ initialContent }
        </div>
        <script type="text/javascript">
          (function() {
            let lastContent = "";
            let lastPercentage = ${ initialPercentage };
            let pollingActive = true;
            
            function updateProgressBar(percentage) {
              if (percentage !== lastPercentage) {
                lastPercentage = percentage;
                document.getElementById("progress-bar-fill").style.width = percentage + "%";
                document.getElementById("progress-percentage-text").textContent = percentage + "% complete";
              }
            }
            
            function pollForUpdates() {
              if (!pollingActive) return;
              
              window.callAmplenotePlugin("getProgress").then(function(result) {
                if (result) {
                  // Handle both new object format and legacy string format
                  var text = typeof result === "object" ? result.text : result;
                  var percentage = typeof result === "object" ? (result.percentage || 0) : 0;
                  
                  if (text && text !== lastContent) {
                    lastContent = text;
                    document.getElementById("progress-content").innerHTML = text;
                  }
                  
                  updateProgressBar(percentage);
                }
                
                if (pollingActive) {
                  setTimeout(pollForUpdates, ${ POLLING_INTERVAL_EMBED_MILLISECONDS });
                }
              }).catch(function(error) {
                console.error("Error polling for progress:", error);
                if (pollingActive) {
                  setTimeout(pollForUpdates, ${ POLLING_INTERVAL_EMBED_MILLISECONDS });
                }
              });
            }
            
            // Start polling after a short delay to ensure embed is fully loaded
            setTimeout(pollForUpdates, ${ INITIAL_POLLING_DELAY });
            
            // Stop polling when page is hidden/closed
            document.addEventListener("visibilitychange", function() {
              pollingActive = !document.hidden;
              if (pollingActive) {
                pollForUpdates();
              }
            });
          })();
        </script>
      </body>
    </html>
  `;
}
