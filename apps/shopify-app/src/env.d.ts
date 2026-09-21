/** Vite build-time env vars this app reads. */
interface ImportMetaEnv {
  /** Optional runtime `<script src>` override baked at build time. */
  readonly VITE_RUNTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Vite handles CSS imports; declare the CSS side-effect import. */
declare module "*.css";
