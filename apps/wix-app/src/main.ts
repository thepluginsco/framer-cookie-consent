/**
 * Entry point for the Wix dashboard authoring page.
 *
 * Mounts the framework-free authoring panel into `#app`. Everything else is
 * static; the only network is to the Data Client Worker.
 */

import "./styles.css";
import { mountApp } from "./dashboard/app.js";

const root = document.getElementById("app");
if (root) mountApp(root);
