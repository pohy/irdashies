import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { spawn } from 'node:child_process';
import path from 'node:path';

const OPENXR_OUT = path.resolve(__dirname, 'native/openxr-layer/build/Release');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'docs/assets/icons/logo'),
    extraResource: [
      path.resolve(__dirname, 'docs/assets/icons'),
      // OpenXR layer DLL + manifest, registered at runtime (see app/vr/openxrLayer).
      path.join(OPENXR_OUT, 'irDashies-OpenXR-Layer.dll'),
      path.join(OPENXR_OUT, 'irDashies-OpenXR.json'),
    ],
  },
  hooks: {
    // Build the OpenXR layer (CMake) before packaging so its DLL + manifest exist
    // for extraResource. Windows-only; npm start skips this (run build:openxr by
    // hand when iterating on the layer).
    prePackage: async (_forgeConfig, platform) => {
      if (platform !== 'win32') return;
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          'pwsh',
          ['-File', path.resolve(__dirname, 'native/build.ps1')],
          { stdio: 'inherit' }
        );
        proc.on('error', reject);
        proc.on('exit', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`native/build.ps1 exited with code ${code}`))
        );
      });
    },
  },
  rebuildConfig: {
    force: true,
  },
  makers: [
    new MakerSquirrel({
      iconUrl: path.resolve(__dirname, 'docs/assets/icons/logo.ico'),
      setupIcon: path.resolve(__dirname, 'docs/assets/icons/logo.ico'),
    }),
    new MakerDMG({
      icon: path.resolve(__dirname, 'docs/assets/icons/logo.icns'),
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'tariknz',
          name: 'irdashies',
        },
        prerelease: true,
      },
    },
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
