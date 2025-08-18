import { useState, useEffect } from 'react';
import { fetchAvailableLanguages } from '../utils/azureApi';

const LanguageSelector = ({ value, onChange, label }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
}) => {
    const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        fetchAvailableLanguages()
            .then((langs: { code: string; display_name: string }[]) => {
                setOptions(langs.map((l) => ({ value: l.code, label: l.display_name })));
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to load languages');
                setLoading(false);
            });
    }, []);

    return (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>
            {loading ? (
                <div className="text-gray-500">Loading...</div>
            ) : error ? (
                <div className="text-red-500">{error}</div>
            ) : (
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                    <option value="">Select a language</option>
                    {options.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
};

export default LanguageSelector;