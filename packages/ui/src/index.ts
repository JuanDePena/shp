export interface PanelShellProps {
  title: string;
  heading: string;
  body: string;
}

export function renderPanelShell(props: PanelShellProps): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${props.title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Iosevka Etoile", "IBM Plex Sans", sans-serif;
        background: #f3efe6;
        color: #1d1d1d;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(199, 160, 106, 0.2), transparent 28rem),
          linear-gradient(135deg, #f7f2e9 0%, #efe4cf 100%);
      }

      main {
        width: min(42rem, calc(100vw - 2rem));
        padding: 2rem;
        border: 1px solid rgba(29, 29, 29, 0.12);
        border-radius: 1.25rem;
        background: rgba(255, 252, 247, 0.92);
        box-shadow: 0 1.5rem 4rem rgba(65, 43, 15, 0.12);
      }

      h1 {
        margin-top: 0;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1;
      }

      p {
        margin-bottom: 0;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${props.heading}</h1>
      <p>${props.body}</p>
    </main>
  </body>
</html>`;
}
