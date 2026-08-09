import csv
import json
import os
import re
import time
import urllib.parse
import urllib.request

CSV_FILE = "goodreads_library_export.csv"
OUTPUT_FILE = "goodreads_data.js"


def clean_isbn(val):
    """Strip out Goodreads dirty formatting like ='0123456789'."""
    if not val:
        return ""
    return re.sub(r"[^0-9X]", "", str(val), flags=re.IGNORECASE)


def clean_title_for_search(title):
    """Remove subtitles, series info in parentheses, and special characters."""
    if not title:
        return ""
    t = re.sub(r"\(.*?\)", "", title)
    t = t.split(":")[0]
    t = re.sub(r"[^\w\s]", " ", t)
    return " ".join(t.split())


def fetch_open_library_direct(isbn):
    """Fetch subjects directly via Open Library Data API (Fast & Reliable)."""
    if not isbn:
        return []
    url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json"
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode())
            key = f"ISBN:{isbn}"
            if key in data and "subjects" in data[key]:
                return [s.get("name", "") for s in data[key]["subjects"]]
    except Exception:
        pass
    return []


def fetch_google_books_data(title, author, isbn=""):
    """Fetch categories AND description snippet from Google Books API."""
    clean_t = clean_title_for_search(title)
    q = f"isbn:{isbn}" if isbn else f"{clean_t} {author}".strip()
    url = f"https://www.googleapis.com/books/v1/volumes?q={urllib.parse.quote(q)}"
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)"}
    )

    categories = []
    description = ""

    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode())
            if "items" in data and len(data["items"]) > 0:
                info = data["items"][0].get("volumeInfo", {})
                categories = info.get("categories", [])
                description = info.get("description", "")
    except Exception:
        pass

    return categories, description


def infer_genres_from_text(text):
    """Smart keyword classifier for titles, subtitles, and synopses."""
    if not text:
        return []

    low = text.lower()
    keywords = [
        (
            [
                "sci-fi",
                "science fiction",
                "space opera",
                "cyberpunk",
                "dystopian",
                "alien",
            ],
            "Science Fiction",
        ),
        (["graphic novel", "comic", "manga", "illustrated"], "Graphic Novel"),
        (
            ["memoir", "autobiography", "biography", "diaries", "journal"],
            "Memoir",
        ),
        (
            ["history", "historical", "world war", "civil war", "century"],
            "History",
        ),
        (
            ["fantasy", "magic", "wizard", "dragon", "realm", "fae", "witch"],
            "Fantasy",
        ),
        (["horror", "supernatural", "ghost", "vampire", "haunted"], "Horror"),
        (
            [
                "thriller",
                "suspense",
                "crime",
                "detective",
                "mystery",
                "murder",
                "investigation",
            ],
            "Mystery",
        ),
        (["poetry", "poems", "verse"], "Poetry"),
        (["essay", "essays"], "Essays"),
        (["philosophy", "philosophical"], "Philosophy"),
        (["psychology", "cognitive", "neuroscience", "behavior"], "Psychology"),
        (
            [
                "business",
                "economy",
                "economics",
                "leadership",
                "startup",
                "management",
            ],
            "Business",
        ),
        (
            [
                "design",
                "ux",
                "ui",
                "user experience",
                "technology",
                "software",
                "programming",
                "code",
                "ai",
            ],
            "Technology",
        ),
        (["music", "musician", "band", "album", "rock"], "Music"),
        (["art", "artist", "painting", "sculpture", "design"], "Art"),
        (["cooking", "cookbook", "recipes", "food"], "Cooking"),
        (["romance", "romantic", "love story"], "Romance"),
        (["classic", "classics"], "Classics"),
    ]

    found = []
    for word_list, genre in keywords:
        if any(
            re.search(r"\b" + re.escape(w) + r"\b", low) for w in word_list
        ):
            if genre not in found:
                found.append(genre)

    return found


def clean_genres(raw_tags, title=""):
    """Normalize raw metadata tags into clean genre labels."""
    rules = [
        ("nonfiction", "Non-fiction"),
        ("non-fiction", "Non-fiction"),
        ("science fiction", "Science Fiction"),
        ("sci-fi", "Science Fiction"),
        ("graphic novel", "Graphic Novel"),
        ("comic", "Comics"),
        ("biography", "Biography"),
        ("autobiography", "Biography"),
        ("memoir", "Memoir"),
        ("fantasy", "Fantasy"),
        ("horror", "Horror"),
        ("thriller", "Thriller"),
        ("suspense", "Thriller"),
        ("mystery", "Mystery"),
        ("detective", "Mystery"),
        ("crime", "Crime"),
        ("poetry", "Poetry"),
        ("essay", "Essays"),
        ("history", "History"),
        ("historical fiction", "History"),
        ("philosophy", "Philosophy"),
        ("psychology", "Psychology"),
        ("business", "Business"),
        ("economics", "Business"),
        ("technology", "Technology"),
        ("computer", "Technology"),
        ("science", "Science"),
        ("art", "Art"),
        ("music", "Music"),
        ("classic", "Classics"),
        ("romance", "Romance"),
        ("fiction", "Fiction"),
    ]

    cleaned = []
    ignored = [
        "accessible book",
        "protected daisy",
        "in library",
        "nyt:",
        "reading level",
        "large type",
        "to-read",
        "currently-reading",
        "read",
        "owned",
        "default",
        "favorites",
    ]

    for item in raw_tags:
        low = str(item).lower().strip()
        if any(ign in low for ign in ignored):
            continue

        matched = False
        for trigger, label in rules:
            if trigger in low:
                if label not in cleaned:
                    cleaned.append(label)
                matched = True
                break

        if (
            not matched
            and len(item) < 20
            and "/" not in item
            and not item.isdigit()
        ):
            formatted = item.strip().title()
            if formatted not in cleaned:
                cleaned.append(formatted)

    return cleaned[:3]


def main():
    if not os.path.exists(CSV_FILE):
        print(
            f"Error: Could not find '{CSV_FILE}'. Place your Goodreads export CSV in this folder."
        )
        return

    books = []
    with open(CSV_FILE, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        books = list(reader)

    print(f"Loaded {len(books)} books from {CSV_FILE}.\n")

    processed_books = []

    for i, b in enumerate(books):
        title = b.get("Title") or b.get("title") or "Untitled"
        author = b.get("Author") or b.get("author") or ""
        isbn13 = clean_isbn(b.get("ISBN13") or b.get("isbn13"))
        isbn = clean_isbn(b.get("ISBN") or b.get("isbn"))
        active_isbn = isbn13 or isbn

        applied = []
        source = "Open Library"

        # 1. Open Library Direct ISBN Data
        if active_isbn:
            ol_subjects = fetch_open_library_direct(active_isbn)
            applied = clean_genres(ol_subjects, title=title)

        # 2. Google Books Categories + Synopsis
        google_cats, google_desc = fetch_google_books_data(
            title, author, active_isbn
        )
        if not applied and google_cats:
            applied = clean_genres(google_cats, title=title)
            if applied:
                source = "Google Books"

        # 3. Goodreads Personal Custom Shelves
        if not applied:
            user_shelves = b.get("Bookshelves") or b.get("bookshelves") or ""
            shelf_list = [
                s.strip() for s in user_shelves.split(",") if s.strip()
            ]
            applied = clean_genres(shelf_list, title=title)
            if applied:
                source = "Goodreads Shelves"

        # 4. Smart Text Classifier on Title + Description
        if not applied or applied == ["Fiction"]:
            combined_text = f"{title} {google_desc} {b.get('My Review', '')}"
            text_genres = infer_genres_from_text(combined_text)
            if text_genres:
                # Append text matches to existing genres or replace
                for g in text_genres:
                    if g not in applied:
                        applied.append(g)
                source = "Text Analysis"

        # 5. Final fallback
        if not applied:
            applied = ["General"]
            source = "Default"

        time.sleep(0.1)  # Lightweight delay

        # Clean duplicates / limit to top 3
        applied = applied[:3]

        book_entry = dict(b)
        book_entry["Genre"] = ", ".join(applied)
        book_entry["genres"] = applied
        processed_books.append(book_entry)

        genre_str = ", ".join(applied)
        display_title = (title[:30] + "..") if len(title) > 32 else title
        print(
            f"[{i+1}/{len(books)}] {display_title:<33} -> [{genre_str:<28}] ({source})"
        )

    # Output window.GOODREADS_EXPORT_DATA array expected by data.js
    js_content = f"window.GOODREADS_EXPORT_DATA = {json.dumps(processed_books, indent=2, ensure_ascii=False)};\n"
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\nFinished! Dataset saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()