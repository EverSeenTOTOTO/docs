import DefaultTheme from "vitepress/theme";
import MyLayout from "./MyLayout.vue";
import "./custom.css";
import Notation from "../components/Notation";

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app }) {
    app.component("Notation", Notation);
  }
};
