'use strict';

const https = require('node:https');

const BASE_HOST = 'waterkaart.net';
const LIST_PATH = '/gids/zwemplekken-nederland.php';
const DETAIL_PATH = '/gids/zwemplek.php';
const TIMEOUT_MS = 15000;

/**
 * Scraper for waterkaart.net — Dutch swimming water temperature and quality.
 *
 * The list page contains a table with all ~900 locations including name,
 * quality status, and current water temperature.
 * Detail pages provide measurement time, E.coli values, coordinates, etc.
 */
class WaterkaartScraper {
  constructor(logger) {
    this._log = typeof logger === 'function' ? logger : () => {};
  }

  _get(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: BASE_HOST,
        port: 443,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'HomeyZwemwater/1.0',
          Accept: 'text/html',
        },
        timeout: TIMEOUT_MS,
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
      });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Fetch all swimming locations from the list page.
   *
   * @returns {Promise<Array<{name: string, urlName: string, quality: string, temperature: number|null}>>}
   */
  async getAllLocations() {
    const html = await this._get(LIST_PATH);
    const locations = [];

    // Match table rows: <td><b><a href="zwemplek.php?naam=X" style="...">Name</a></td>
    // <td><font ...>goed</font> - <font ...>6.4°C</font></td>
    const rowRegex = /<a\s+href="zwemplek\.php\?naam=([^"]+)"[^>]*>([^<]+)<\/a><\/td><td>(.+?)<\/td>/g;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const urlName = match[1];
      const name = this._decodeHtml(match[2]).trim();
      const qualityTemp = match[3].trim();

      // Strip HTML tags: "<font ...>goed</font> - <font ...>6.4°C</font>" → "goed - 6.4°C"
      const cleanText = qualityTemp.replace(/<[^>]*>/g, '').trim();
      let quality = cleanText;
      let temperature = null;

      const parts = cleanText.split(' - ');
      if (parts.length >= 2) {
        quality = parts[0].trim();
        const tempMatch = parts[1].match(/([\d.]+)/);
        if (tempMatch) temperature = parseFloat(tempMatch[1]);
      }

      locations.push({ name, urlName, quality, temperature });
    }

    this._log(`Parsed ${locations.length} locations from waterkaart.net`);
    return locations;
  }

  /**
   * Fetch detail information for a specific swimming location.
   *
   * @param {string} urlName - The URL name parameter (e.g. "Bussloo-t-Gorsselaar")
   * @returns {Promise<{temperature: number|null, measurementTime: string, quality: string, lastCheck: string, lat: number|null, lng: number|null}|null>}
   */
  async getLocationDetail(urlName) {
    try {
      const html = await this._get(`${DETAIL_PATH}?naam=${encodeURIComponent(urlName)}`);

      // Temperature: ~4.2°C in a heading
      let temperature = null;
      let measurementTime = '';
      const tempMatch = html.match(/~([\d.]+)\s*°C/);
      if (tempMatch) temperature = parseFloat(tempMatch[1]);

      const timeMatch = html.match(/Meettijd:\s*([^<\n]+)/);
      if (timeMatch) measurementTime = timeMatch[1].trim();

      // Quality: "zwemwaterkwaliteit bij X is  <b><font ...>goed</font></b>"
      let quality = '';
      const qualityMatch = html.match(/zwemwaterkwaliteit[^<]*is\s*<b><font[^>]*>([^<]+)<\/font><\/b>/i);
      if (qualityMatch) quality = qualityMatch[1].trim();

      // Last check: "<b>Laatste controle</b> 22-09-2025"
      let lastCheck = '';
      const checkMatch = html.match(/<b>Laatste controle<\/b>\s*([\d-]+)/);
      if (checkMatch) lastCheck = checkMatch[1].trim();

      // Coordinates from JS variables (use uncommented lines only)
      let lat = null;
      let lng = null;
      // Match lines NOT starting with // — last occurrence wins (uncommented overrides commented)
      const coordMatches = html.matchAll(/^\s+aNord\s*=\s*([\d.]+);\s*\n\s+aSud\s*=\s*([\d.]+);\s*\n\s+aEst\s*=\s*([\d.]+);\s*\n\s+aOvest\s*=\s*([\d.]+)/gm);
      for (const cm of coordMatches) {
        const nord = parseFloat(cm[1]);
        const sud = parseFloat(cm[2]);
        const est = parseFloat(cm[3]);
        const ovest = parseFloat(cm[4]);
        lat = Math.round(((nord + sud) / 2) * 1e6) / 1e6;
        lng = Math.round(((est + ovest) / 2) * 1e6) / 1e6;
      }

      return { temperature, measurementTime, quality, lastCheck, lat, lng };
    } catch (err) {
      this._log(`getLocationDetail failed for ${urlName}: ${err.message}`);
      return null;
    }
  }

  _decodeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");
  }
}

module.exports = WaterkaartScraper;
