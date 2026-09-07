import { Outlet } from "react-router-dom";
import "../styles/index.css";
import UiTranslator from "../components/UiTranslator";

export function Layout() {
  return (
    <main className="p-2 pt-1 h-full">
      <UiTranslator />
      <Outlet />
    </main>
  );
}
