import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/check-domain?domain=example.com
 * Checks if a domain is reachable and returns status info
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain');

  if (!domain) {
    return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
  }

  // Clean the domain
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  try {
    // Try to fetch the domain with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`https://${cleanDomain}`, {
      method: 'HEAD', // Just check headers, don't download body
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    return NextResponse.json({
      domain: cleanDomain,
      status: 'live',
      statusCode: response.status,
      finalUrl: response.url,
      redirected: response.redirected,
    });
  } catch (error: unknown) {
    // Try HTTP if HTTPS failed
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${cleanDomain}`, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      return NextResponse.json({
        domain: cleanDomain,
        status: 'live',
        statusCode: response.status,
        finalUrl: response.url,
        redirected: response.redirected,
        httpsOnly: false,
      });
    } catch {
      // Both failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({
        domain: cleanDomain,
        status: 'dead',
        error: errorMessage.includes('abort') ? 'timeout' : 'unreachable',
      });
    }
  }
}
