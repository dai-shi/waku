import type { ReactNode } from "react";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";

const Home = () => (
	<>
		<h2 className="text-xl font-bold">Waku</h2>
		<article className="mt-6 bg-gray-800 text-white p-12 rounded">
			<div className="text-3xl">
				Minimalistic React Framework with React Server Components
			</div>
		</article>
	</>
);

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col min-h-screen w-screen bg-cWhite text-cBlack gap-8">
			<Nav></Nav>
			<main className="grow px-8">{children || <Home />}</main>
			<Footer></Footer>
		</div>
	);
}
