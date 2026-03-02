'use strict';

const Homey = require('homey');
const WaterkaartScraper = require('../../lib/waterkaart-scraper');

class SwimmingLocationDriver extends Homey.Driver {
  async onInit() {
    this._scraper = new WaterkaartScraper(this.log.bind(this));
  }

  async onPair(session) {
    let allLocationsCache = null;
    let selectedLocation = null;
    let lastSearchResults = null;

    session.setHandler('searchLocations', async (query) => {
      this.log('searchLocations called, query:', query);
      try {
        if (!allLocationsCache) {
          allLocationsCache = await this._scraper.getAllLocations();
          this.log(`Fetched ${allLocationsCache.length} locations from waterkaart.net`);
        }

        let results;
        if (!query || query.trim() === '') {
          results = allLocationsCache.slice(0, 20);
        } else {
          const q = query.toLowerCase();
          results = allLocationsCache
            .filter((l) => l.name.toLowerCase().includes(q))
            .slice(0, 20);
        }

        lastSearchResults = results;
        this.log(`Returning ${results.length} results`);
        session.emit('searchResults', results).catch(() => {});
        return results;
      } catch (err) {
        this.log('searchLocations error:', err.message);
        const errorResult = { error: err.message };
        session.emit('searchResults', errorResult).catch(() => {});
        return errorResult;
      }
    });

    session.setHandler('getSearchResults', async () => {
      return lastSearchResults;
    });

    session.setHandler('selectLocation', async (urlName) => {
      this.log('selectLocation called, urlName:', urlName);
      try {
        if (!allLocationsCache) {
          return { success: false, error: 'Zoek eerst een locatie' };
        }

        const loc = allLocationsCache.find((l) => l.urlName === urlName);
        if (!loc) {
          return { success: false, error: 'Locatie niet gevonden' };
        }

        selectedLocation = loc;
        this.log('selectLocation success:', loc.name);
        return { success: true };
      } catch (err) {
        this.log('selectLocation error:', err.message);
        return { success: false, error: err.message };
      }
    });

    session.setHandler('getSummary', async () => {
      if (!selectedLocation) return null;
      const summary = {
        locationName: selectedLocation.name,
        quality: selectedLocation.quality,
        temperature: selectedLocation.temperature,
      };
      this.log('getSummary returning:', summary.locationName);
      session.emit('summaryData', summary).catch(() => {});
      return summary;
    });

    session.setHandler('list_devices', async () => {
      this.log('list_devices called, selectedLocation:', selectedLocation ? selectedLocation.name : 'null');
      if (!selectedLocation) return [];
      return [
        {
          name: selectedLocation.name,
          data: { id: `waterkaart-${selectedLocation.urlName}` },
          settings: {
            url_name: selectedLocation.urlName,
            refresh_interval: '21600',
          },
        },
      ];
    });
  }
}

module.exports = SwimmingLocationDriver;
