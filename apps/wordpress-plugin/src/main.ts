/**
 * Entry point for the WordPress admin bundle.
 *
 * PHP renders a mount node (`#consentful-admin`) on the settings screen and
 * enqueues this bundle. `#app` is the fallback so `npm run dev` (index.html)
 * mounts the same UI standalone.
 */

import "./styles.css";
import { mountApp } from "./app.js";

const root = document.getElementById("consentful-admin") ?? document.getElementById("app");
if (root) mountApp(root as HTMLElement);
