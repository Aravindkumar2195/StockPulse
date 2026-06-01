import requests
import json
import os
import io
import pandas as pd
from bs4 import BeautifulSoup

os.makedirs('data', exist_ok=True)
headers = {'User-Agent': 'Mozilla/5.0'}

# BSE Sensex
try:
    html = requests.get('https://en.wikipedia.org/wiki/BSE_SENSEX', headers=headers).text
    soup = BeautifulSoup(html, 'html.parser')
    table = soup.find('table', {'class': 'wikitable'})
    symbols = []
    for row in table.find_all('tr')[1:]:
        cols = row.find_all('td')
        if len(cols) > 1:
            sym = cols[1].text.strip()
            if sym:
                symbols.append(sym + '.BO')
    with open('data/bse_sensex.json', 'w') as f:
        json.dump(symbols, f)
    print(f"Saved {len(symbols)} to data/bse_sensex.json")
except Exception as e:
    print("BSE", e)

def fetch_nse_index(url, filename):
    try:
        csv_text = requests.get(url, headers=headers).text
        df = pd.read_csv(io.StringIO(csv_text))
        symbols = [str(x).strip() + ".NS" for x in df['Symbol'].tolist()]
        with open(filename, 'w') as f:
            json.dump(symbols, f)
        print(f"Saved {len(symbols)} to {filename}")
    except Exception as e:
        print(filename, e)

fetch_nse_index('https://archives.nseindia.com/content/indices/ind_nifty500list.csv', 'data/nifty500.json')
fetch_nse_index('https://archives.nseindia.com/content/indices/ind_nifty100list.csv', 'data/nifty100.json')
fetch_nse_index('https://archives.nseindia.com/content/indices/ind_nifty200list.csv', 'data/nifty200.json')

