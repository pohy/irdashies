# irDashies OpenXR Layer (PoC)

OpenXR **implicit API layer**. Injects into any OpenXR D3D11 app, hooks
`xrEndFrame`, and renders a composition-layer quad into the headset.

It reads a shared D3D11 texture published by a producer over shared memory
(`../shared/irdashies_shm.h`) and shader-blits it onto the quad. The producer is
the irDashies app (`src/app/vr`). If no producer is running, the layer passes
the game's own frame through untouched.

See `../../vr-openxr-design.md` for the full design and where this fits.

## What it does

- Registers as an implicit API layer (loader calls
  `irDashies_xrNegotiateLoaderApiLayerInterface`).
- On `xrCreateSession`, grabs the app's D3D11 device (+ `Device1`/`Device5`/
  `Context4`), creates a `LOCAL` reference space and a fullscreen-triangle blit
  pipeline.
- On `xrEndFrame`:
  - reads the latest producer frame from shared memory;
  - duplicates the producer's texture + fence handles into the game process,
    opens them (`OpenSharedResource1` / `OpenSharedFence`);
  - sizes the quad swapchain to the texture, waits on the shared fence, and
    blits the texture into the swapchain image;
  - appends an `XrCompositionLayerQuad` (pose/size from the producer) to the
    app's layer list before calling the real `xrEndFrame`.
- No producer → game frame passes through untouched (no overlay drawn).

## Build

Requires CMake ≥ 3.22, Visual Studio 2022 (C++), and git (for FetchContent of
the OpenXR-SDK headers).

```pwsh
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target irDashiesOpenXRLayer
```

Outputs:

- `build/Release/irDashies-OpenXR-Layer.dll` — the layer
- `build/Release/irDashies-OpenXR.json` — the manifest (absolute DLL path baked in)

## Register / unregister

The app registers the layer per-user (no admin) when VR is enabled and
unregisters it when VR is disabled / on quit / on uninstall — see
`src/app/vr/openxrLayer.ts`. Implicit layers live under
`HKCU\SOFTWARE\Khronos\OpenXR\1\ApiLayers\Implicit` (the OpenXR loader reads
both HKCU and HKLM).

For manual dev testing without the app, register/unregister the value directly
(`reg`, no admin needed for HKCU):

```pwsh
$json = (Resolve-Path build/Release/irDashies-OpenXR.json).Path
reg add "HKCU\Software\Khronos\OpenXR\1\ApiLayers\Implicit" /v $json /t REG_DWORD /d 0 /f
reg delete "HKCU\Software\Khronos\OpenXR\1\ApiLayers\Implicit" /v $json /f
```

Temporarily disable a registered layer without removing it:

```pwsh
$env:DISABLE_IRDASHIES_OPENXR = "1"
```

## Test

The texture source is the irDashies app (`src/app/vr`). Any OpenXR D3D11 app
works as the host — iRacing with OpenXR selected in the launcher, or Khronos
`hello_xr` (D3D11 graphics plugin).

1. Build the layer (above).
2. Run irDashies (`npm start`) and enable the overlay with the toggle in the VR
   settings section — this registers the layer (HKCU) and starts the producer.
3. Launch the OpenXR app.
4. Expect the overlay quad in front of you. No producer (irDashies closed / VR
   off) → the layer passes the game's frame through untouched.
5. Confirm load even without a headset: check
   `%TEMP%\irdashies-openxr-layer.log` (negotiate / session / shared-memory
   stages). `XR_LOADER_DEBUG=all` makes the loader list the layer.

## Status / limitations

- Builds + exports correctly. Cross-process texture/fence transport validated
  headless (probe). **In-headset blit not yet confirmed on a real runtime.**
- Single global session state (no multi-session / multi-instance handling).
- Uses the app's **immediate** D3D11 context — fine for now, but a real build
  should use its own device/context to avoid clobbering app pipeline state
  (OpenKneeboard does this).
- Not gated to iRacing yet — loads into every OpenXR app while registered.
  Process-name gating is a later step (see design doc).
- Single quad only; per-widget atlas + multiple quads come later.
