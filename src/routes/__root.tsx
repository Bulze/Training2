import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const Route = createRootRoute({
	component: Root,
});

function Root() {
	return (
		<div className="dark flex flex-col min-h-screen bg-slate-950 text-slate-100">
			<ErrorBoundary tagName="main" className="flex-1">
				<Outlet />
			</ErrorBoundary>
			<TanStackRouterDevtools position="bottom-right" />
		</div>
	);
}
