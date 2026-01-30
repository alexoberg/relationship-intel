'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseLinkedInCSV, deduplicateContacts, ParsedContact } from '@/lib/linkedin-parser';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported: number;
    errors: string[];
  } | null>(null);

  const supabase = createClient();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParsing(true);
    setImportResult(null);
    setParseErrors([]);

    try {
      const content = await selectedFile.text();
      const result = await parseLinkedInCSV(content);

      if (result.success) {
        const unique = deduplicateContacts(result.contacts);
        setParsedContacts(unique);
        setParseErrors(result.errors);
      } else {
        setParseErrors(result.errors);
        setParsedContacts([]);
      }
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : 'Failed to parse file']);
      setParsedContacts([]);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleImport = async () => {
    if (parsedContacts.length === 0) return;

    setImporting(true);
    setImportResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const errors: string[] = [];
      let imported = 0;

      // Batch insert in chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < parsedContacts.length; i += chunkSize) {
        const chunk = parsedContacts.slice(i, i + chunkSize);

        const contactsToInsert = chunk.map((c) => ({
          owner_id: user.id,
          first_name: c.first_name,
          last_name: c.last_name,
          full_name: c.full_name,
          email: c.email,
          linkedin_url: c.linkedin_url,
          current_title: c.current_title,
          current_company: c.current_company,
          source: 'linkedin_csv' as const,
          category: 'uncategorized' as const,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .upsert(contactsToInsert, {
            onConflict: 'owner_id,email',
            ignoreDuplicates: true,
          })
          .select();

        if (error) {
          errors.push(`Batch ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
        } else {
          imported += data?.length || 0;
        }
      }

      setImportResult({
        success: errors.length === 0,
        imported,
        errors,
      });
    } catch (err) {
      setImportResult({
        success: false,
        imported: 0,
        errors: [err instanceof Error ? err.message : 'Import failed'],
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Import Contacts</h1>
        <p className="text-gray-600 mt-1">
          Upload your LinkedIn connections CSV to get started
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
        <h3 className="font-semibold text-blue-900 mb-2">
          How to export your LinkedIn connections
        </h3>
        <ol className="text-blue-800 space-y-2 text-sm">
          <li>1. Go to LinkedIn Settings &rarr; Data Privacy &rarr; Get a copy of your data</li>
          <li>2. Select &quot;Connections&quot; and request the archive</li>
          <li>3. Download and extract the ZIP file</li>
          <li>4. Upload the <code className="bg-blue-100 px-1 rounded">Connections.csv</code> file below</li>
        </ol>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            file ? 'border-primary-300 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-upload"
            disabled={parsing || importing}
          />
          <label htmlFor="csv-upload" className="cursor-pointer">
            {parsing ? (
              <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
            ) : file ? (
              <FileText className="w-12 h-12 text-primary-500 mx-auto mb-4" />
            ) : (
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            )}
            <p className="text-lg font-medium text-gray-900 mb-1">
              {file ? file.name : 'Drop your CSV file here'}
            </p>
            <p className="text-sm text-gray-500">
              {parsing ? 'Parsing...' : 'or click to browse'}
            </p>
          </label>
        </div>

        {/* Parse Results */}
        {parsedContacts.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-medium text-gray-900">
                  {parsedContacts.length} contacts ready to import
                </span>
              </div>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import Contacts'
                )}
              </button>
            </div>

            {/* Preview */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedContacts.slice(0, 10).map((contact, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{contact.full_name}</td>
                      <td className="px-4 py-3 text-gray-600">{contact.email || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{contact.current_company || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{contact.current_title || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedContacts.length > 10 && (
                <div className="px-4 py-3 bg-gray-50 text-center text-sm text-gray-500">
                  And {parsedContacts.length - 10} more contacts...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Parse Errors */}
        {parseErrors.length > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-800">Parse warnings</span>
            </div>
            <ul className="text-sm text-red-700 space-y-1">
              {parseErrors.slice(0, 5).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
              {parseErrors.length > 5 && (
                <li>And {parseErrors.length - 5} more...</li>
              )}
            </ul>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div
            className={`mt-6 rounded-lg p-4 ${
              importResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle
                className={`w-5 h-5 ${
                  importResult.success ? 'text-green-500' : 'text-yellow-500'
                }`}
              />
              <span
                className={`font-medium ${
                  importResult.success ? 'text-green-800' : 'text-yellow-800'
                }`}
              >
                {importResult.imported} contacts imported
                {importResult.errors.length > 0 && ` (${importResult.errors.length} errors)`}
              </span>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="text-sm text-yellow-700 space-y-1">
                {importResult.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
