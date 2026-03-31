import axios from "axios";
import type { GrantData } from "@/lib/types";

/**
 * Shadow API Hunter
 *
 * Many government and foundation websites use hidden JSON APIs behind
 * their public-facing pages. These can be discovered by:
 *
 * 1. Open the website in Chrome/Firefox
 * 2. Open DevTools → Network tab
 * 3. Filter by XHR/Fetch requests
 * 4. Browse the site / use search features
 * 5. Look for JSON endpoints that return structured data
 *
 * Common patterns:
 * - ArcGIS REST APIs for geographic eligibility maps
 * - WordPress REST API (/wp-json/wp/v2/posts?categories=grants)
 * - Dynamic table libraries (DataTables, AG Grid) loading from JSON
 * - Drupal JSON:API endpoints
 * - Form builders that fetch options from APIs
 *
 * When you discover an endpoint, add it to KNOWN_ENDPOINTS below.
 */

interface ShadowEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  transform: (data: unknown) => GrantData[];
}

// Add discovered endpoints here as you find them via browser DevTools
const KNOWN_ENDPOINTS: ShadowEndpoint[] = [
  // Example (uncomment and modify when you discover a real endpoint):
  // {
  //   name: "ieda-programs-api",
  //   url: "https://www.iowaeda.com/wp-json/wp/v2/programs",
  //   method: "GET",
  //   transform: (data) => {
  //     const posts = data as Array<{ title: { rendered: string }; content: { rendered: string }; link: string }>;
  //     return posts.map(post => ({
  //       title: post.title.rendered,
  //       description: post.content.rendered.replace(/<[^>]*>/g, "").slice(0, 500),
  //       sourceUrl: post.link,
  //       sourceName: "ieda-api",
  //       grantType: "STATE" as const,
  //       status: "OPEN" as const,
  //       businessStage: "BOTH" as const,
  //       gender: "ANY" as const,
  //       locations: ["Iowa"],
  //       industries: [],
  //       categories: [],
  //       eligibleExpenses: [],
  //     }));
  //   },
  // },
];

export async function fetchShadowAPIs(): Promise<GrantData[]> {
  if (KNOWN_ENDPOINTS.length === 0) {
    console.log(
      "[shadow-api] No endpoints registered yet. Use browser DevTools to discover hidden APIs."
    );
    return [];
  }

  const allGrants: GrantData[] = [];

  for (const endpoint of KNOWN_ENDPOINTS) {
    try {
      const response =
        endpoint.method === "POST"
          ? await axios.post(endpoint.url, endpoint.body, {
              headers: endpoint.headers,
              timeout: 15000,
            })
          : await axios.get(endpoint.url, {
              headers: endpoint.headers,
              timeout: 15000,
            });

      const grants = endpoint.transform(response.data);
      allGrants.push(...grants);

      console.log(
        `[shadow-api] Fetched ${grants.length} grants from ${endpoint.name}`
      );
    } catch (error) {
      console.error(
        `[shadow-api] Error fetching ${endpoint.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return allGrants;
}
