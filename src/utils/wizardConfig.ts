import jsYaml from "js-yaml";
import { Config } from "../model/Config";
import { fileDataToConfig } from "./utils";
import { ControllerService, SetConfigFilenameCommand } from "../services";
import {
    GOLD_CONFIG,
    MINI_PRO_CONFIG,
    PRO_CONFIG,
    PRO_PULLEY_CONFIG
} from "../assets/configs";

/**
 * FluidNC `Config` plus the Dune-Weaver-specific top-level keys that the schema
 * in `model/Config.ts` does not declare but that exist in the YAML.
 */
export type WizardConfig = Config & {
    hostname?: string;
    leds?: {
        data_pin?: string;
        num_leds?: number;
        color_order?: string;
        frame_ms?: number;
    };
};

export type TableTypeId = "pro" | "mini_pro" | "gold" | "pro_pulley";

export type TableType = {
    id: TableTypeId;
    label: string;
    configText: string;
    defaultHostname: string;
    // Default LED count assuming a 60 LEDs/m strip.
    defaultNumLeds: number;
};

export const TABLE_TYPES: TableType[] = [
    {
        id: "pro",
        label: "Dune Weaver Pro",
        configText: PRO_CONFIG,
        defaultHostname: "DWPro",
        defaultNumLeds: 133
    },
    {
        id: "mini_pro",
        label: "Dune Weaver Mini Pro",
        configText: MINI_PRO_CONFIG,
        defaultHostname: "DWMP",
        defaultNumLeds: 49
    },
    {
        id: "gold",
        label: "Dune Weaver Gold",
        configText: GOLD_CONFIG,
        defaultHostname: "DWGold",
        defaultNumLeds: 75
    },
    {
        id: "pro_pulley",
        label: "Dune Weaver Pro (Pulley)",
        configText: PRO_PULLEY_CONFIG,
        defaultHostname: "DWProPulley",
        defaultNumLeds: 133
    }
];

export const getTableType = (id: TableTypeId): TableType =>
    TABLE_TYPES.find((t) => t.id === id) ?? TABLE_TYPES[0];

/**
 * The filename uploaded to the device flash and activated as the running config.
 */
export const WIZARD_CONFIG_FILENAME = "config.yaml";

/**
 * Parse a bundled config template and apply the user's choices (table name /
 * hostname, LED count).
 */
export const buildConfig = (
    configText: string,
    options: {
        hostname?: string;
        numLeds?: number;
        homeOnStartup?: boolean;
    }
): WizardConfig => {
    const config = fileDataToConfig(configText) as WizardConfig;

    if (options.hostname) {
        config.hostname = options.hostname;
    }
    if (options.numLeds != null && config.leds) {
        config.leds.num_leds = options.numLeds;
    }
    if (options.homeOnStartup != null) {
        applyStartupHoming(config, options.homeOnStartup);
    }

    return config;
};

/**
 * How the table finds its zero position. Both modes home; they differ in how:
 *  - `sensor`: limit-switch `$H` cycle (default).
 *  - `crash`: drives the rho carriage blindly into its physical center stop.
 * The active mode is a persisted firmware setting (`$Sand/HomingMode`), not a
 * config.yaml field — apply it with {@link homingModeCommand}.
 */
export type HomingMode = "sensor" | "crash";

/** Firmware command that persists the homing mode (`$Sand/HomingMode=`). */
export const homingModeCommand = (mode: HomingMode): string =>
    "$Sand/HomingMode=" + mode;

/**
 * Configure whether the table auto-homes on boot. Uses the mode-aware
 * `$Sand/Home` startup line (honors `$Sand/HomingMode`), not raw `$H` which
 * would always force sensor homing.
 */
export const applyStartupHoming = (
    config: WizardConfig,
    homeOnStartup: boolean
): WizardConfig => {
    if (!config.macros) {
        config.macros = {};
    }
    if (config.start) {
        config.start.must_home = false;
    }
    if (homeOnStartup) {
        config.macros.startup_line0 = "$Sand/Home";
    } else {
        delete config.macros.startup_line0;
    }
    return config;
};

export type AxisHomingSettings = {
    /** Direction the axis travels to search for its limit switch. */
    positiveDirection: boolean;
    /** Distance the axis backs off the switch after it triggers (mm). */
    pulloffMm: number;
    /** Fast rate while searching for the switch (mm/min). */
    seekMmPerMin: number;
    /** Slow rate for the final, precise approach to the switch (mm/min). */
    feedMmPerMin: number;
    /** Machine coordinate assigned to the axis at the moment of homing (mm). */
    mposMm: number;
};

/** Read the current homing settings for an axis out of a config. */
export const getAxisHoming = (
    config: WizardConfig,
    axis: "x" | "y"
): AxisHomingSettings => {
    const homing = config.axes?.[axis]?.homing;
    const motor = config.axes?.[axis]?.motor0;
    return {
        positiveDirection: homing?.positive_direction ?? false,
        pulloffMm: motor?.pulloff_mm ?? 0,
        seekMmPerMin: homing?.seek_mm_per_min ?? 0,
        feedMmPerMin: homing?.feed_mm_per_min ?? 0,
        mposMm: homing?.mpos_mm ?? 0
    };
};

/** Write homing settings for an axis back into a config. */
export const applyAxisHoming = (
    config: WizardConfig,
    axis: "x" | "y",
    settings: AxisHomingSettings
): WizardConfig => {
    const homing = config.axes?.[axis]?.homing;
    const motor = config.axes?.[axis]?.motor0;
    if (homing) {
        homing.positive_direction = settings.positiveDirection;
        homing.seek_mm_per_min = settings.seekMmPerMin;
        homing.feed_mm_per_min = settings.feedMmPerMin;
        homing.mpos_mm = settings.mposMm;
    }
    if (motor) {
        motor.pulloff_mm = settings.pulloffMm;
    }
    return config;
};

/**
 * Toggle the direction of an axis by adding/removing the `:low` suffix on its
 * stepstick `direction_pin` (e.g. `i2so.6` <-> `i2so.6:low`). FluidNC interprets
 * `:low` as an active-low (inverted) direction signal.
 */
export const toggleDirection = (
    config: WizardConfig,
    axis: "x" | "y"
): WizardConfig => {
    const stepstick = config.axes?.[axis]?.motor0?.stepstick;
    const pin = stepstick?.direction_pin;
    if (!stepstick || !pin) {
        return config;
    }

    stepstick.direction_pin = pin.endsWith(":low")
        ? pin.slice(0, -":low".length)
        : pin + ":low";

    return config;
};

/** Serialize a config back to FluidNC-compatible YAML text. */
export const dumpConfig = (config: WizardConfig): string => {
    const yaml = jsYaml.dump(config, { noCompatMode: true });
    // FluidNC "YAML" does not implement null — emit a bare key instead.
    return yaml.replace(/: null\n/g, ":\n");
};

/**
 * Upload a config to device flash, make it the active config, and reboot the
 * controller so the new settings take effect. Mirrors the proven flow in
 * `pages/fluidnc/calibrate/Calibrate.tsx`.
 */
export const uploadAndActivate = async (
    controllerService: ControllerService,
    config: WizardConfig,
    fileName: string = WIZARD_CONFIG_FILENAME
): Promise<void> => {
    const configData = dumpConfig(config);

    await controllerService.uploadFile(
        "/littlefs/" + fileName,
        Buffer.from(configData)
    );

    // Use a timeout so a non-responsive controller surfaces an error instead of
    // hanging the UI forever (send() defaults to no timeout).
    await controllerService.send(new SetConfigFilenameCommand(fileName), 10000);

    await controllerService.hardReset();
};
