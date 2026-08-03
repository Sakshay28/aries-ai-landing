'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit3, Loader2, Link2, Check, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { SavedLocation, LOCATION_CATEGORIES, LocationCategory } from '@/lib/types/location';

export default function SavedLocationsTab() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<SavedLocation | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [category, setCategory] = useState<LocationCategory>('general');
  const [priority, setPriority] = useState('0');
  const [isDefault, setIsDefault] = useState(false);

  // Utility states
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/locations');
      const json = await res.json();
      if (json.success) {
        setLocations(json.data || []);
      } else {
        toast.error(json.error || 'Failed to load locations');
      }
    } catch (err) {
      toast.error('Network error loading locations');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLoc(null);
    setName('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setGoogleMapsUrl('');
    setCategory('general');
    setPriority('0');
    setIsDefault(false);
    setModalOpen(true);
  };

  const openEditModal = (loc: SavedLocation) => {
    setEditingLoc(loc);
    setName(loc.name);
    setAddress(loc.address);
    setLatitude(String(loc.latitude));
    setLongitude(String(loc.longitude));
    setGoogleMapsUrl(loc.google_maps_url || '');
    setCategory(loc.category as LocationCategory || 'general');
    setPriority(String(loc.priority || 0));
    setIsDefault(loc.is_default || false);
    setModalOpen(true);
  };

  const handleResolveGmaps = async () => {
    if (!googleMapsUrl.trim()) {
      toast.error('Please paste a Google Maps link first');
      return;
    }
    setResolving(true);
    try {
      const res = await fetch('/api/locations/resolve-gmaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleMapsUrl.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setName(json.data.name || name);
        setAddress(json.data.address || address);
        setLatitude(String(json.data.latitude));
        setLongitude(String(json.data.longitude));
        toast.success('Google Maps URL resolved successfully!');
      } else {
        toast.error(json.error || 'Failed to resolve URL');
      }
    } catch (err) {
      toast.error('Network error resolving URL');
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !latitude.trim() || !longitude.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      toast.error('Latitude must be between -90 and 90');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      toast.error('Longitude must be between -180 and 180');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      address: address.trim(),
      latitude: latNum,
      longitude: lngNum,
      google_maps_url: googleMapsUrl.trim() || undefined,
      category,
      priority: parseInt(priority) || 0,
      is_default: isDefault,
    };

    try {
      const url = editingLoc ? `/api/locations/${editingLoc.id}` : '/api/locations';
      const method = editingLoc ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(editingLoc ? 'Location updated successfully!' : 'Location saved successfully!');
        setModalOpen(false);
        fetchLocations();
      } else {
        toast.error(json.error || 'Failed to save location');
      }
    } catch (err) {
      toast.error('Network error saving location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return;
    try {
      const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('Location deleted successfully');
        fetchLocations();
      } else {
        toast.error(json.error || 'Failed to delete location');
      }
    } catch (err) {
      toast.error('Network error deleting location');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Saved Locations Library</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage reusable locations for AI automated responses, flow building nodes, and live chat agent shortcuts.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/10">
          <MapPin className="w-12 h-12 text-gray-400 mb-3" />
          <h3 className="text-lg font-medium">No locations saved yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mt-1">
            Add locations like your main branch, parking valet coordinates, or banquet hall entry so the AI can automatically share them as interactive cards.
          </p>
          <button
            onClick={openAddModal}
            className="mt-4 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
          >
            Create your first location
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex flex-col justify-between p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all duration-200"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                    {loc.category}
                  </span>
                  <div className="flex items-center gap-1">
                    {loc.is_default && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300">
                        Default
                      </span>
                    )}
                    <span className="text-xs text-gray-400">P:{loc.priority}</span>
                  </div>
                </div>

                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mt-1">{loc.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{loc.address}</p>

                <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span>{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 mt-4 pt-3">
                <a
                  href={loc.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                >
                  <Link2 className="w-3 h-3" />
                  Google Maps
                </a>

                <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(loc)}
                    className="p-1.5 text-gray-500 hover:text-emerald-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Edit Location"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Delete Location"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-850">
              <h3 className="font-bold text-lg">{editingLoc ? 'Edit Location' : 'Add New Location'}</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Google Maps URL (Fast Autofill)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Paste link here..."
                      value={googleMapsUrl}
                      onChange={(e) => setGoogleMapsUrl(e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleResolveGmaps}
                    disabled={resolving}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 rounded-lg transition-colors"
                  >
                    {resolving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Resolve
                  </button>
                </div>
                <span className="text-[10px] text-gray-400">
                  Resolves coordinates, name, and address automatically from maps.app.goo.gl redirect links.
                </span>
              </div>

              <div className="border-t border-dashed border-gray-200 dark:border-gray-800 my-4" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as LocationCategory)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                  >
                    {LOCATION_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Priority
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Location Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Romeo Lane Jaipur (Main entrance)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Address Details *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Street name, floor number, landmark..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Latitude *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 26.912434"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Longitude *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 75.787271"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-transparent border-gray-300 dark:border-gray-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_default" className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
                  Set as default location for this business
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border rounded-lg border-gray-200 dark:border-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 rounded-lg transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
