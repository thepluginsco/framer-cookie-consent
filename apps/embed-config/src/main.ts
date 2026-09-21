/**
 * Entry point for the hosted embed config page.
 *
 * Mounts the framework-free authoring app into `#app`. Everything else is static.
 */

import "./styles.css";
import { mountApp } from "./app.js";

const root = document.getElementById("app");
if (root) mountApp(root);
