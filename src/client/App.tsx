import { BgBananas } from "./components/Common";
import { Home } from "./components/Home";
import { Room } from "./components/Room";
import { useRoute } from "./router";

export function App() {
  const [route, navigate] = useRoute();
  return (
    <div className="app">
      <BgBananas />
      {route.name === "home" ? <Home navigate={navigate} /> : <Room key={route.code} code={route.code} navigate={navigate} />}
    </div>
  );
}
