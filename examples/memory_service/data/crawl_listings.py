import json
import os
import re
import time
from firecrawl import FirecrawlApp, ScrapeOptions
from dotenv import load_dotenv


def extract_listing_id(url):
    """Extracts the listing ID from a PropertyGuru URL."""
    match = re.search(r"-(\d+)$", url)
    if match:
        return match.group(1)
    return None


def crawl_and_save_listings(
    json_filepath="listings.json", output_folder="crawled_listings"
):
    """
    Reads listing URLs from a JSON file, crawls them using Firecrawl,
    and saves the content as markdown files.
    """
    load_dotenv()  # Load environment variables from .env file, if present
    api_key = os.getenv("FIRECRAWL_API_KEY")

    if not api_key:
        print("Error: FIRECRAWL_API_KEY environment variable not set.")
        return

    try:
        print(f"Reading listings from {json_filepath}...")
        with open(json_filepath, "r", encoding="utf-8") as f:
            listings = json.load(f)
    except FileNotFoundError:
        print(f"Error: {json_filepath} not found.")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {json_filepath}.")
        return

    if not os.path.exists(output_folder):
        print(f"Creating output folder: {output_folder}...")
        os.makedirs(output_folder)

    app = FirecrawlApp(api_key=api_key)
    print(f"Found {len(listings)} listings to crawl.")

    for i, listing in enumerate(listings):
        url = listing.get("url")
        if not url:
            print(f"Skipping listing {i+1} due to missing URL.")
            continue

        listing_id = extract_listing_id(url)
        if not listing_id:
            print(f"Skipping URL (could not extract ID): {url}")
            continue

        output_md_filepath = os.path.join(output_folder, f"{listing_id}.md")
        print(f"Crawling ({i+1}/{len(listings)}): {url} (ID: {listing_id})")

        try:
            # Crawl the URL
            # Note: Firecrawl's crawl_url returns a dictionary.
            # The markdown content is usually in response['markdown']
            # or response['data']['content'] if using older versions or different params.
            # Checking documentation for the exact key.
            # Based on common usage, it's often `response.markdown` or `response['markdown']`
            # For firecrawl-py, it's `crawl_result.markdown`
            crawl_result = app.scrape_url(
                url,
                formats=["markdown"],
                only_main_content=True,
            )

            if crawl_result and crawl_result.markdown:
                with open(output_md_filepath, "w", encoding="utf-8") as md_file:
                    md_file.write(crawl_result.markdown)
                print(f"Successfully saved: {output_md_filepath}")
            else:
                print(
                    f"Failed to get markdown content for {url}. Response: {crawl_result}"
                )
                # Save an empty file or error message if preferred
                with open(output_md_filepath, "w", encoding="utf-8") as md_file:
                    md_file.write(
                        f"# Error crawling URL: {url}\n\nFirecrawl response did not contain markdown."
                    )

        except Exception as e:
            print(f"Error crawling {url}: {e}")
            # Optionally, save an error message to the file
            with open(output_md_filepath, "w", encoding="utf-8") as md_file:
                md_file.write(f"# Error crawling URL: {url}\n\nException: {e}")

        # Add a small delay to be respectful to the server and API rate limits
        if i < len(listings) - 1:  # Don't sleep after the last item
            time.sleep(1)  # 1-second delay

    print("Crawling process completed.")


if __name__ == "__main__":
    crawl_and_save_listings()
