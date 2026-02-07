import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const provider = new AssetManagerViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AssetManagerViewProvider.viewType,
      provider
    )
  );
}

export function deactivate() {}

class AssetManagerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "assetManagerView";

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "fileDropped":
          await this.handleFileDropped(message, webviewView.webview);
          break;
      }
    });
  }

  private async handleFileDropped(
    message: any,
    webview: vscode.Webview
  ): Promise<void> {
    try {
      const fileName: string = message.fileName;
      const base64Data: string = message.base64;

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      const workspaceUri = workspaceFolders[0].uri;
      const assetsUri = vscode.Uri.joinPath(workspaceUri, "assets");

      // Ensure /assets exists
      await vscode.workspace.fs.createDirectory(assetsUri);

      const fileUri = vscode.Uri.joinPath(assetsUri, fileName);

      const fileBytes = Buffer.from(base64Data, "base64");
      await vscode.workspace.fs.writeFile(fileUri, fileBytes);

      // Placeholder cloud upload
      await uploadToCloud({
        fileName,
        data: base64Data
      });

      // Insert Markdown into active editor
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const markdown = `![Image](assets/${fileName})`;
        await editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, markdown);
        });
      } else {
        vscode.window.showInformationMessage(
          "File saved to /assets, but no active editor to insert Markdown."
        );
      }

      vscode.window.showInformationMessage(
        `Saved ${fileName} to /assets and inserted Markdown link.`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error saving file: ${err?.message ?? err}`);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src ${webview.cspSource} blob:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Asset Manager</title>
        <style>
          body {
            font-family: system-ui, sans-serif;
            padding: 0.75rem;
          }
          #dropzone {
            border: 2px dashed #888;
            border-radius: 6px;
            padding: 1.5rem;
            text-align: center;
            color: #888;
            cursor: pointer;
          }
          #dropzone.dragover {
            border-color: #4a90e2;
            color: #4a90e2;
            background: rgba(74, 144, 226, 0.05);
          }
        </style>
      </head>
      <body>
        <div id="dropzone">
          <strong>Drag & Drop</strong> files here<br/>
          or click to select.
        </div>
        <input id="fileInput" type="file" style="display:none" />

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const dropzone = document.getElementById("dropzone");
          const fileInput = document.getElementById("fileInput");

          dropzone.addEventListener("click", () => fileInput.click());

          fileInput.addEventListener("change", (event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              handleFile(files[0]);
            }
          });

          dropzone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropzone.classList.add("dragover");
          });

          dropzone.addEventListener("dragleave", (event) => {
            event.preventDefault();
            dropzone.classList.remove("dragover");
          });

          dropzone.addEventListener("drop", (event) => {
            event.preventDefault();
            dropzone.classList.remove("dragover");
            const files = event.dataTransfer.files;
            if (files && files.length > 0) {
              handleFile(files[0]);
            }
          });

          function handleFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result.split(",")[1];
              vscode.postMessage({
                type: "fileDropped",
                fileName: file.name,
                base64: base64
              });
            };
            reader.readAsDataURL(file);
          }
        </script>
      </body>
      </html>
    `;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Placeholder cloud upload function
async function uploadToCloud(fileData: { fileName: string; data: string }) {
  // Later: add fetch() calls with your API keys stored in Codespaces secrets
  // For now, it's just a no-op.
  return;
}
