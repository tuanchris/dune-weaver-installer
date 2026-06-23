import { Command, ControllerService, GetStatusCommand } from "../services";
import { sleep } from "./utils";

export type ThetaRhoPoint = { theta: number; rho: number };

const TWO_PI = Math.PI * 2;

/**
 * Generate a continuous {5/2} pentagram (classic 5-pointed star) as a sequence
 * of theta-rho points. The star is built in cartesian space and sampled into
 * polar coordinates, with theta unwrapped so consecutive points never jump by
 * more than half a turn (otherwise the angular axis would spin the long way).
 */
export const generateStar = (
    options: { points?: number; rhoMax?: number; samplesPerEdge?: number } = {}
): ThetaRhoPoint[] => {
    const points = options.points ?? 5;
    const rhoMax = options.rhoMax ?? 0.9;
    const samplesPerEdge = options.samplesPerEdge ?? 24;

    // Outer vertices, starting at the top and going clockwise.
    const vertices = Array.from({ length: points }, (_, i) => {
        const angle = -Math.PI / 2 + (i * TWO_PI) / points;
        return { x: Math.cos(angle) * rhoMax, y: Math.sin(angle) * rhoMax };
    });

    // Visit vertices in pentagram order (skip one each step), closing the loop.
    const skip = Math.floor(points / 2); // 2 for a 5-point star
    const order: number[] = [];
    for (let i = 0; i <= points; i++) {
        order.push((i * skip) % points);
    }

    const result: ThetaRhoPoint[] = [];
    let prevTheta = 0;
    let first = true;

    for (let seg = 0; seg < order.length - 1; seg++) {
        const a = vertices[order[seg]];
        const b = vertices[order[seg + 1]];
        for (let s = 1; s <= samplesPerEdge; s++) {
            const t = s / samplesPerEdge;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            const rho = Math.min(1, Math.hypot(x, y));
            let theta = Math.atan2(y, x);

            if (first) {
                first = false;
            } else {
                // Unwrap to keep the step within (-PI, PI].
                let delta = theta - (prevTheta % TWO_PI);
                if (delta > Math.PI) delta -= TWO_PI;
                if (delta < -Math.PI) delta += TWO_PI;
                theta = prevTheta + delta;
            }
            prevTheta = theta;
            result.push({ theta, rho });
        }
    }

    return result;
};

/**
 * Convert theta-rho points to FluidNC G-code lines for a ThetaRho machine.
 *
 * With `theta_mm_per_rev` and `rho_mm` from the config, the firmware's
 * cartesian input is (theta_mm, rho_mm) where one full revolution = theta_mm_per_rev
 * and rho 0..1 maps to 0..rho_mm. (Confirmed by the main app's jogs: X50 ≈ 1 rev,
 * Y20 ≈ full radius.)
 */
export const toGcodeLines = (
    points: ThetaRhoPoint[],
    options: { thetaMmPerRev?: number; rhoMm?: number; feed?: number } = {}
): string[] => {
    const thetaMmPerRev = options.thetaMmPerRev ?? 50;
    const rhoMm = options.rhoMm ?? 20;
    const feed = options.feed ?? 100;

    const lines = ["G90", "G21"];
    for (const p of points) {
        const x = (p.theta * thetaMmPerRev) / TWO_PI;
        const y = p.rho * rhoMm;
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feed}`);
    }
    return lines;
};

/** Poll the controller status until it reports Idle (or the timeout elapses). */
export const waitForIdle = async (
    controllerService: ControllerService,
    timeoutMs: number = 120000
): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await sleep(500);
        try {
            const status = await controllerService.send(
                new GetStatusCommand(),
                2000
            );
            if (status.result().state.startsWith("Idle")) {
                return true;
            }
        } catch {
            // Ignore transient poll errors.
        }
    }
    return false;
};

/**
 * Stream G-code lines to the controller one at a time. `controllerService.send`
 * serializes commands and resolves on each `ok`, providing natural backpressure
 * against the planner buffer. Reports progress per line.
 */
export const streamGcode = async (
    controllerService: ControllerService,
    lines: string[],
    onProgress?: (done: number, total: number) => void
): Promise<void> => {
    for (let i = 0; i < lines.length; i++) {
        await controllerService.send(new Command(lines[i]), 30000);
        onProgress?.(i + 1, lines.length);
    }
    await waitForIdle(controllerService);
};
