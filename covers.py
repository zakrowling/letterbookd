import os
import csv
import re
import json
import urllib.request
import urllib.parse
import urllib.error

# Configuration
CSV_FILE = 'goodreads_library_export.csv'
IMAGE_DIR = 'img'
TIMEOUT = 10

if not os.path.exists(IMAGE_DIR):
    os.makedirs(IMAGE_DIR)
    print(f"Created directory: {IMAGE_DIR}/")

def clean_isbn(val):
    if not val:
        return ''
    return re.sub(r'[^0-9X]', '', str(val), flags=re.IGNORECASE)

def download_image(url, save_path):
    """Downloads an image using built-in urllib."""
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            content_type = response.info().get_content_type()
            if 'image' in content_type:
                data = response.read()
                with open(save_path, 'wb') as f:
                    f.write(data)
                return True
    except Exception:
        pass
    return False

def get_google_books_cover(title, author, isbn):
    """Fallback fetch cover URL from Google Books API using urllib."""
    query = f"isbn:{isbn}" if isbn else f"intitle:{title}+inauthor:{author}"
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.googleapis.com/books/v1/volumes?q={encoded_query}"
    
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            data = json.loads(response.read().decode('utf-8'))
            if 'items' in data and len(data['items']) > 0:
                image_links = data['items'][0]['volumeInfo'].get('imageLinks', {})
                cover_url = image_links.get('thumbnail') or image_links.get('smallThumbnail')
                if cover_url:
                    return cover_url.replace('http://', 'https://')
    except Exception:
        pass
    return None

def process_csv():
    if not os.path.exists(CSV_FILE):
        print(f"Error: Could not find '{CSV_FILE}'. Make sure it is in the same directory.")
        return

    downloaded = 0
    skipped = 0
    failed = 0

    with open(CSV_FILE, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            book_id = row.get('Book Id') or row.get('id') or ''
            title = row.get('Title') or 'Untitled'
            author = row.get('Author') or ''
            isbn13 = clean_isbn(row.get('ISBN13'))
            isbn = clean_isbn(row.get('ISBN'))
            active_isbn = isbn13 or isbn

            if not book_id:
                book_id = re.sub(r'\W+', '_', title.lower())

            file_name = f"{book_id}.jpg"
            local_path = os.path.join(IMAGE_DIR, file_name)

            if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                skipped += 1
                continue

            candidate_urls = []
            if active_isbn:
                candidate_urls.append(f"https://covers.openlibrary.org/b/isbn/{active_isbn}-L.jpg")

            google_url = get_google_books_cover(title, author, active_isbn)
            if google_url:
                candidate_urls.append(google_url)

            success = False
            for url in candidate_urls:
                if download_image(url, local_path):
                    if os.path.getsize(local_path) < 1000:
                        os.remove(local_path)
                        continue
                    success = True
                    downloaded += 1
                    print(f"✓ Downloaded: {title} -> {local_path}")
                    break

            if not success:
                failed += 1
                print(f"✗ Failed to find image for: {title}")

    print("\n--- Download Summary ---")
    print(f"Downloaded: {downloaded}")
    print(f"Already existed: {skipped}")
    print(f"Failed/Missing: {failed}")

if __name__ == '__main__':
    process_csv()