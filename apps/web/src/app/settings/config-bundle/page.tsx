import ConfigBundlePanel from './ConfigBundlePanel';

export default function ConfigBundlePage() {
  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-4 sm:mb-6">
        <h1 className="heading-page">Configuration bundle</h1>
        <p className="text-meta mt-0.5 sm:mt-1">
          Move alert rules, channel preferences, and filter presets between environments
        </p>
      </div>
      <ConfigBundlePanel />
    </div>
  );
}
