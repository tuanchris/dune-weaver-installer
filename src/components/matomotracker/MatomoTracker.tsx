import { MatomoProvider, createInstance } from "@datapunt/matomo-tracker-react";
import React, { ReactNode, useEffect } from "react";
import useTrackEvent, {
    TrackAction,
    TrackCategory
} from "../../hooks/useTrackEvent";

type Props = {
    children: ReactNode;
};

const MatomoTracker = ({ children }: Props) => {
    // Analytics is disabled for the Dune Weaver fork. The provider is kept so
    // that components using useTrackEvent keep working as no-ops. Set a urlBase
    // and siteId (and remove `disabled`) to enable your own Matomo instance.
    const instance = createInstance({
        urlBase: "https://localhost/",
        siteId: 1,
        disabled: true
    });

    const trackEvent = useTrackEvent();
    useEffect(() => {
        trackEvent(TrackCategory.Start, TrackAction.Start);
    }, []);

    return <MatomoProvider value={instance}>{children}</MatomoProvider>;
};

export default MatomoTracker;
