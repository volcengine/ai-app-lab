from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
import time

def get_page_source(url, output_filename="page_dump.html"):
    """
    Visits a given URL using Selenium, waits for the page to load,
    and dumps the page source into an HTML file.

    Args:
        url (str): The URL to visit.
        output_filename (str): The name of the HTML file to save the page source to.
    """
    print(f"Initializing WebDriver...")
    # Set up Chrome options
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')  # Run in headless mode (no browser UI)
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36")

    driver = None
    try:
        print(f"Attempting to visit URL: {url}")
        # Initialize WebDriver
        driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)

        # Navigate to the URL
        driver.get(url)

        # Wait for a few seconds to allow dynamic content to load
        # You might need to adjust this time or implement more sophisticated waits
        # (e.g., WebDriverWait for specific elements) for complex pages.
        print("Waiting for page to load (10 seconds)...")
        time.sleep(10) # Increased wait time for potentially heavy pages

        print("Fetching page source...")
        page_source = driver.page_source

        print(f"Saving page source to {output_filename}...")
        with open(output_filename, "w", encoding="utf-8") as f:
            f.write(page_source)
        print(f"Successfully saved page source to {output_filename}")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if driver:
            print("Closing WebDriver...")
            driver.quit()

if __name__ == "__main__":
    target_url = "https://www.propertyguru.com.sg/property-for-rent?listingType=rent&page=1&isCommercial=false&maxPrice=5000&mrtStations=CC22&mrtStations=CC9&mrtStations=EW10&mrtStations=EW15&mrtStations=EW16&mrtStations=EW17&mrtStations=EW18&mrtStations=EW19&mrtStations=EW20&mrtStations=EW21&mrtStations=EW6&mrtStations=EW7&mrtStations=EW8&mrtStations=EW9&mrtStations=NE3&mrtStations=TE17&mrtStations=TE18&mrtStations=TE23&mrtStations=TE24&mrtStations=TE25&mrtStations=TE26&mrtStations=TE27&mrtStations=TE28&bedrooms=3&_freetextDisplay=EW20+Commonwealth+MRT%2CEW19+Queenstown+MRT%2CEW18+Redhill+MRT%2CEW17+Tiong+Bahru+MRT%2CEW16%2FNE3%2FTE17+Outram+Park+MRT%2CEW21%2FCC22+Buona+Vista+MRT%2CTE18+Maxwell+MRT%2CEW15+Tanjong+Pagar+MRT%2CTE23+Tanjong+Rhu+MRT%2CTE24+Katong+Park+MRT%2CTE25+Tanjong+Katong+MRT%2CTE26+Marine+Parade+MRT%2CTE27+Marine+Terrace+MRT%2CTE28+Siglap+MRT%2CEW10+Kallang+MRT%2CEW9+Aljunied+MRT%2CEW8%2FCC9+Paya+Lebar+MRT%2CEW7+Eunos+MRT%2CEW6+Kembangan+MRT&sort=date&order=desc"
    get_page_source(target_url)
