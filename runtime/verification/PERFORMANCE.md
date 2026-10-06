# Performance validation

The proposal defers offscreen reference frames with native iframe lazy loading, preloads its bundled local fonts, and delivers the existing material modules in one dependency-ordered browser bundle. Candidate module sources remain available separately for host integration and review. No image quality, appearance default or design behavior is changed by bundling.

Measurements must distinguish controlled lab profiles from real-user data. The recorded profiles use a cold browser cache, a desktop viewport, and a phone viewport with 4× CPU slowdown, 150ms emulated latency and 1.6Mbps download throughput. LCP, layout shifts, long tasks, request bytes and idle CPU are sampled. These runs are not a Lighthouse score or field Core Web Vitals certification.

The interactive proposal verifier also checks that deferred references load when opened, preserve same-origin message transport and reject messages from another origin or source window.
