const LanguageSelector = ({ value, onChange, label, options }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    options: { value: string; label: string }[];
}) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
        >
            {options.map(option => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </div>
);


export default LanguageSelector;