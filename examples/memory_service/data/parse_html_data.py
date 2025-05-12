import json
from bs4 import BeautifulSoup


def extract_listings_from_html(
    html_filepath="page_dump.html", output_json_filepath="listings.json"
):
    """
    Parses an HTML file to find a <script type="application/ld+json"> tag,
    extracts the JSON content, and transforms it into a list of housing listings.

    Args:
        html_filepath (str): Path to the input HTML file.
        output_json_filepath (str): Path to save the extracted JSON list.
    """
    try:
        print(f"Reading HTML file: {html_filepath}...")
        with open(html_filepath, "r", encoding="utf-8") as f:
            html_content = f.read()

        print("Parsing HTML content...")
        soup = BeautifulSoup(html_content, "html.parser")

        print("Searching for JSON-LD script tag...")
        script_tag = soup.find("div", attrs={"class": "main-content"})

        if not script_tag:
            print(
                'Error: Could not find the <script type="application/ld+json"> tag in the HTML.'
            )
            return

        print("Extracting JSON data from script tag...")
        script_part = script_tag.find("script")
        json_ld_data_string = script_part.contents[0]

        if not json_ld_data_string:
            print("Error: The script tag is empty.")
            return

        # The provided string is already valid JSON, so direct parsing is fine.
        # In some cases, further cleaning might be needed if the content isn't pure JSON.
        json_ld_data = json.loads(json_ld_data_string)

        extracted_listings = []
        if json_ld_data and "@context" in json_ld_data and "mainEntity" in json_ld_data:
            main_entity = json_ld_data.get("mainEntity", {})
            item_list_elements = main_entity.get("itemListElement", [])

            print(f"Found {len(item_list_elements)} items in itemListElement.")
            for item_entry in item_list_elements:
                listing_item = item_entry.get("item", {})
                if listing_item:
                    # Simplify the structure if needed, or take as is
                    # For this request, we'll take the 'item' content directly
                    # and add the position.
                    simplified_listing = {
                        "position": item_entry.get("position"),
                        "datePosted": listing_item.get("datePosted"),
                        "url": listing_item.get("url"),
                        "name": listing_item.get("spatial", {}).get("name"),
                        "propertyType": listing_item.get("spatial", {})
                        .get("additionalProperty", {})
                        .get("value"),
                    }
                    extracted_listings.append(simplified_listing)
        else:
            print(
                "Error: JSON-LD data does not have the expected structure ('mainEntity' or 'itemListElement' missing)."
            )
            print("Dumping raw JSON-LD data found:")
            print(
                json.dumps(json_ld_data, indent=2)
            )  # Print what was found for debugging
            return

        print(f"Saving extracted listings to {output_json_filepath}...")
        with open(output_json_filepath, "w", encoding="utf-8") as f:
            json.dump(extracted_listings, f, indent=2, ensure_ascii=False)
        print(
            f"Successfully extracted and saved {len(extracted_listings)} listings to {output_json_filepath}"
        )

    except FileNotFoundError:
        print(f"Error: The file {html_filepath} was not found.")
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from the script tag: {e}")
        print("Problematic JSON string snippet (first 500 chars):")
        if "json_ld_data_string" in locals():
            print(json_ld_data_string[:500])
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


if __name__ == "__main__":
    extract_listings_from_html()
