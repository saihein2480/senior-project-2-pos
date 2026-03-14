import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Handle /@vite/client requests (commonly made by browser extensions or dev tools)
  // This prevents 404 errors when using Next.js instead of Vite
  if (request.nextUrl.pathname === "/@vite/client") {
    return new NextResponse(
      "// Next.js application - Vite client not available",
      {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }

  // Continue with normal request processing
  return NextResponse.next();
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    // Match all request paths except for the ones starting with:
    // - api (API routes)
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico (favicon file)
    // But include /@vite/client specifically
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/@vite/client",
  ],
};
