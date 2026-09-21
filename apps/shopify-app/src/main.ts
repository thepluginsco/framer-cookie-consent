/**
 * Entry point for the Shopify authoring UI.
 *
 * Mounts the framework-free authoring page into `#app`. Everything is static;
 * there is no network at all — the page's output (the app-embed block) is copied
 * or downloaded and deployed with the Shopify CLI.
 */

import "./styles.css";
import { mountApp } from "./app.js";

const root = document.getElementById("app");
if (root) mountApp(root);
