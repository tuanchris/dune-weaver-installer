import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./i18n";

// On GitHub Pages the app is served from a project subpath
// (https://<user>.github.io/dune-weaver-installer/), so the router needs a
// basename in production builds. The dev server runs at the root.
// If you move to a custom domain / root hosting, set this to undefined.
const basename =
    process.env.NODE_ENV === "production"
        ? "/dune-weaver-installer"
        : undefined;

const container = document.getElementById("app");
const root = createRoot(container);
root.render(
    <BrowserRouter basename={basename}>
        <App />
    </BrowserRouter>
);
