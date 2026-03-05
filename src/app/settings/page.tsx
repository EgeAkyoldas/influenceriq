'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Key, SlidersHorizontal, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Settings save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Filter Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5" />
              Pre-Filter Thresholds
            </CardTitle>
            <CardDescription>
              Configure minimum thresholds for the pre-filter engine. Profiles below these thresholds will be filtered out before AI analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_followers">Min Followers</Label>
                <Input
                  id="min_followers"
                  type="number"
                  value={settings.min_followers || '5000'}
                  onChange={e => update('min_followers', e.target.value)}
                  placeholder="5000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_engagement_rate">Min Engagement Rate (%)</Label>
                <Input
                  id="min_engagement_rate"
                  type="number"
                  step="0.1"
                  value={settings.min_engagement_rate || '1.0'}
                  onChange={e => update('min_engagement_rate', e.target.value)}
                  placeholder="1.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_english_content">Min English Content (%)</Label>
                <Input
                  id="min_english_content"
                  type="number"
                  value={settings.min_english_content || '60'}
                  onChange={e => update('min_english_content', e.target.value)}
                  placeholder="60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_posts_per_month">Min Posts/Month</Label>
                <Input
                  id="min_posts_per_month"
                  type="number"
                  value={settings.min_posts_per_month || '2'}
                  onChange={e => update('min_posts_per_month', e.target.value)}
                  placeholder="2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* API Keys */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Configuration
            </CardTitle>
            <CardDescription>
              API keys are stored in your .env.local file. These display fields show the current configuration status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Instagram Access Token</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="flex-1"
                />
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  Set in .env.local
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gemini API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="flex-1"
                />
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  Set in .env.local
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit your <code className="px-1 py-0.5 bg-muted rounded text-xs">.env.local</code> file to update API keys, then restart the dev server.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <Separator />

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-emerald-400"
          >
            Settings saved ✓
          </motion.span>
        )}
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
