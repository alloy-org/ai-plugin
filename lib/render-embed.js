
// --------------------------------------------------------------------------
export default function renderPluginEmbed(app, plugin) {
  return `
    <html>
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
        <div class="plugin-embed-container" data-rendered-at="${ new Date().toISOString() }">
          ${ plugin.progressText }
        </div>
      </body>
    </html>
  `;
}
