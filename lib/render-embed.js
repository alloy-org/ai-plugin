import { POLLING_INTERVAL_EMBED_MILLISECONDS } from "constants/search-settings"

const INITIAL_POLLING_DELAY = 100;

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
            let pollingActive = true;
            
            function pollForUpdates() {
              if (!pollingActive) return;
              
              window.callAmplenotePlugin("getProgress").then(function(result) {
                if (result && result !== lastContent) {
                  lastContent = result;
                  document.getElementById("progress-content").innerHTML = result;
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
            setTimeout(pollForUpdates, INITIAL_POLLING_DELAY);
            
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
