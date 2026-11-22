/// <reference types="vite/client" />
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Root element #app not found in index.html");
}

mount(App, { target });
