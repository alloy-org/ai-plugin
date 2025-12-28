
// --------------------------------------------------------------------------
export default function renderPluginEmbed(app, plugin, renderArguments) {
  return `
    <html lang="en">
      <head>
        <style>
          body {
            background-color: #fff;
            color: #333;
            padding: 10px;
          }
          
          .plugin-embed-container {
            font-family: "Roboto", sans-serif;
          }
        </style>
      </head>
      <body>
        <div class="plugin-embed-container" 
          data-args="${ typeof(renderArguments) === "object" ? JSON.stringify(renderArguments) : renderArguments }" 
          data-rendered-at="${ new Date().toISOString() }"
        >
          ${ plugin.progressText }
        </div>
      </body>
    </html>
  `;
}
