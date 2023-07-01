# @noahsaso/cosmodal

A wallet connector with mobile WalletConnect support for the Cosmos ecosystem.

> **Warning**
> This library is no longer being actively maintained. I recommended using
> [CosmosKit](https://github.com/cosmology-tech/cosmos-kit) instead, which is
> actively maintained and supports many more wallets.

## Example

The example is deployed on Vercel at https://cosmodal-noahsaso.vercel.app/

It can also be run locally using these commands:

```sh
# Clone the repo.
git clone https://github.com/NoahSaso/cosmodal
# Enter the example folder.
cd cosmodal/example

# Start the Next.js dev server.
npm install && npm run dev
# OR
yarn && yarn dev
```

## Setup

1. Install the Cosmodal package in your React project along with its `@cosmjs/*`
   peer dependencies.

```sh
npm install --save @noahsaso/cosmodal @cosmjs/amino @cosmjs/cosmwasm-stargate @cosmjs/crypto \
@cosmjs/encoding @cosmjs/proto-signing @cosmjs/stargate @keplr-wallet/common \
@keplr-wallet/cosmos @keplr-wallet/provider @keplr-wallet/stores @keplr-wallet/types
# OR
yarn add @noahsaso/cosmodal @cosmjs/amino @cosmjs/cosmwasm-stargate @cosmjs/crypto \
@cosmjs/encoding @cosmjs/proto-signing @cosmjs/stargate @keplr-wallet/common \
@keplr-wallet/cosmos @keplr-wallet/provider @keplr-wallet/stores @keplr-wallet/types
```

2. Import `WalletManagerProvider` and wrap it around your whole app. Only
   include it once as an ancestor of all components that need to access the
   wallet. Likely you'll want this in your root App component. Check out the
   example code to see how to define wallets.

```tsx
import {
  WalletManagerProvider,
  ChainInfoID,
  WalletType,
} from "@noahsaso/cosmodal"

const MyApp: FunctionComponent<AppProps> = ({ Component, pageProps }) => (
  <WalletManagerProvider
    defaultChainId={ChainInfoID.Juno1}
    enabledWalletTypes={[
      WalletType.Leap,
      WalletType.Keplr,
      WalletType.KeplrMobile,
    ]}
    walletConnectClientMeta={{
      name: "CosmodalExampleDAPP",
      description: "A dapp using the cosmodal library.",
      url: "https://cosmodal.example.app",
      icons: ["https://cosmodal.example.app/walletconnect.png"],
    }}
  >
    <Component {...pageProps} />
  </WalletManagerProvider>
)

export default MyApp
```

3. Manage the wallet by using the `useWalletManager` and `useWallet` hooks in
   your pages and components.

```tsx
import {
  useWalletManager,
  useWallet,
  WalletConnectionStatus,
} from "@noahsaso/cosmodal"

const Home: NextPage = () => {
  const { connect, disconnect } = useWalletManager()
  const { status, error, name, address, signingCosmWasmClient } = useWallet()

  return status === WalletConnectionStatus.Connected ? (
    <div>
      <p>
        Name: <b>{name}</b>
      </p>
      <p>
        Address: <b>{address}</b>
      </p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  ) : (
    <div>
      <button onClick={connect}>Connect</button>
      {error && <p>{error instanceof Error ? error.message : `${error}`}</p>}
    </div>
  )
}

export default Home
```

## API

### WalletManagerProvider

This component takes the following properties:

| Property                          | Type                                                | Required | Description                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabledWalletTypes`              | `WalletType[]`                                      | &#x2611; | Wallet types available for connection.                                                                                                                                                          |
| `defaultChainId`                  | `string`                                            | &#x2611; | Chain ID to initially connect to and selected by default if nothing is passed to the hook. Must be present in one of the objects in `chainInfoList`.                                            |
| `walletOptions`                   | `Partial<Record<WalletType, Record<string, any>>>`  |          | Optional wallet options to be passed to wallet clients.                                                                                                                                         |
| `chainInfoOverrides`              | `ChainInfoOverrides`                                |          | List or getter of additional or replacement ChainInfo objects. These will take precedent over internal definitions by comparing `chainId`.                                                      |
| `walletConnectClientMeta`         | `IClientMeta`                                       |          | Descriptive info about the React app which gets displayed when enabling a WalletConnect wallet (e.g. name, image, etc.).                                                                        |
| `preselectedWalletType`           | `WalletType`                                        |          | When set to a valid wallet type, the connect function will skip the selection modal and attempt to connect to this wallet immediately.                                                          |
| `localStorageKey`                 | `string`                                            |          | localStorage key for saving, loading, and auto connecting to a wallet.                                                                                                                          |
| `onKeystoreChangeEvent`           | `(event: Event) => unknown`                         |          | Callback that will be attached as a listener to the `keplr_keystorechange` event on the window object.                                                                                          |
| `getSigningCosmWasmClientOptions` | `SigningClientGetter<SigningCosmWasmClientOptions>` |          | Getter for options passed to SigningCosmWasmClient on connection.                                                                                                                               |
| `getSigningStargateClientOptions` | `SigningClientGetter<SigningStargateClientOptions>` |          | Getter for options passed to SigningStargateClient on connection.                                                                                                                               |
| `defaultUiConfig`                 | `DefaultUiConfig`                                   |          | Default UI config.                                                                                                                                                                              |
| `disableDefaultUi`                | `boolean`                                           |          | Disables the default UI so a custom UI can be built. UI Props can be retrieved from the `useWalletManager` hook's `uiProps` field. It should contain everything necessary to build a custom UI. |

### useWalletManager

```
() => IWalletManagerContext
```

This hook returns all relevant fields, but you will likely only use this to
`connect` and `disconnect`.

### useWallet

```
(chainId?: ChainInfo["chainId"]) => UseWalletResponse
```

This hook is a subset of `useWalletManager`, returning the fields inside the
`connectedWallet` object, as well as `status` and `error`. It also takes an
optional `chainId`, which will instantiate clients for the desired chain once
the wallet is connected. This lets you seamlessly connect and use clients for
many different chains. If no `chainId` is passed, it will return the connection
info for the default chain (from the initial wallet connection via
`useWalletManager`'s `connect` function).

### useConnectWalletToChain

```
() => ConnectWalletToChainFunction
```

This hook provides a function that takes a `chainId` and tries to connect to it
with the already connected wallet client. This function expects the wallet to
already be connected to the default chain.

### Relevant types

```tsx
type ConnectWalletToChainFunction = (
  chainId: ChainInfo["chainId"]
) => Promise<ConnectedWallet>

type UseWalletResponse = Partial<ConnectedWallet> &
  Pick<IWalletManagerContext, "status" | "error">

interface ModalClassNames {
  modalContent?: string
  modalOverlay?: string
  modalHeader?: string
  modalSubheader?: string
  modalCloseButton?: string
  walletList?: string
  wallet?: string
  walletImage?: string
  walletInfo?: string
  walletName?: string
  walletDescription?: string
  textContent?: string
}

interface IClientMeta {
  description: string
  url: string
  icons: string[]
  name: string
}

type WalletClient = Keplr | KeplrWalletConnectV1

enum WalletType {
  Leap = "leap",
  Keplr = "keplr",
  KeplrMobile = "keplr_mobile",
}

interface ConnectedWallet {
  // Wallet.
  wallet: Wallet
  // Wallet client.
  walletClient: WalletClient
  // Chain info the clients are connected to.
  chainInfo: ChainInfo
  // Offline signer for the wallet client.
  offlineSigner: OfflineSigner
  // Name of wallet.
  name: string
  // Wallet address.
  address: string
  // Wallet public key.
  publicKey: {
    data: Uint8Array
    hex: string
  }
  // Signing client for interacting with CosmWasm chain APIs.
  signingCosmWasmClient: SigningCosmWasmClient
  // Signing client for interacting with Stargate chain APIs.
  signingStargateClient: SigningStargateClient
}

enum WalletConnectionStatus {
  Initializing,
  AttemptingAutoConnection,
  // Don't call connect until this state is reached.
  ReadyForConnection,
  Connecting,
  Connected,
  Resetting,
}

type SigningClientGetter<T> = (
  chainInfo: ChainInfo
) => T | Promise<T | undefined> | undefined

type ChainInfoOverrides =
  | ChainInfo[]
  | (() => undefined | ChainInfo[] | Promise<undefined | ChainInfo[]>)

interface IWalletManagerContext {
  // Function to begin the connection process. This will either display
  // the wallet picker modal or immediately attempt to connect to a wallet
  // when `preselectedWalletType` is set.
  connect: () => void
  // Function that disconnects from the connected wallet.
  disconnect: () => void
  // Connected wallet info and clients for interacting with the chain.
  connectedWallet?: ConnectedWallet
  // Status of cosmodal.
  status: WalletConnectionStatus
  // If status is WalletConnectionStatus.Connected.
  connected: boolean
  // Error encountered during the connection process.
  error?: unknown
  // If this app is running inside the Keplr Mobile web interface.
  isEmbeddedKeplrMobileWeb: boolean
  // List or getter of additional or replacement ChainInfo objects. These
  // will take precedent over internal definitions by comparing `chainId`.
  // This is passed through from the provider props to allow composition
  // of your own hooks, and for use in the built-in useWallet hook.
  chainInfoOverrides?: ChainInfoOverrides
  // Getter for options passed to SigningCosmWasmClient on connection.
  // This is passed through from the provider props to allow composition
  // of your own hooks, and for use in the built-in useWallet hook.
  getSigningCosmWasmClientOptions?: SigningClientGetter<SigningCosmWasmClientOptions>
  // Getter for options passed to SigningStargateClient on connection.
  // This is passed through from the provider props to allow composition
  // of your own hooks, and for use in the built-in useWallet hook.
  getSigningStargateClientOptions?: SigningClientGetter<SigningStargateClientOptions>
  // UI Props.
  uiProps: UiProps
}

interface WalletManagerProviderProps {
  // Wallet types available for connection.
  enabledWalletTypes: WalletType[]
  // Optional wallet options for each wallet type.
  walletOptions?: Partial<Record<WalletType, Record<string, any>>>
  // Chain ID to initially connect to and selected by default if nothing
  // is passed to the hook. Must be present in one of the objects in
  // `chainInfoList`.
  defaultChainId: string
  // List or getter of additional or replacement ChainInfo objects. These
  // will take precedent over internal definitions by comparing `chainId`.
  chainInfoOverrides?: ChainInfoOverrides
  // Descriptive info about the webapp which gets displayed when enabling a
  // WalletConnect wallet (e.g. name, image, etc.).
  walletConnectClientMeta?: IClientMeta
  // When set to a valid wallet type, the connect function will skip the
  // selection modal and attempt to connect to this wallet immediately.
  preselectedWalletType?: `${WalletType}`
  // localStorage key for saving, loading, and auto connecting to a wallet.
  localStorageKey?: string
  // Callback that will be attached as a listener to the keystore change event
  // on the window object. The event key is determined by the
  // `windowKeystoreRefreshEvent` field in the wallet definition.
  onKeystoreChangeEvent?: (event: Event) => unknown
  // Getter for options passed to SigningCosmWasmClient on connection.
  getSigningCosmWasmClientOptions?: SigningClientGetter<SigningCosmWasmClientOptions>
  // Getter for options passed to SigningStargateClient on connection.
  getSigningStargateClientOptions?: SigningClientGetter<SigningStargateClientOptions>
  // Default UI config.
  defaultUiConfig?: DefaultUiConfig
  // If true, disable the default UI.
  disableDefaultUi?: boolean
}

type DefaultUiConfig = {
  // Class names applied to various components for custom theming.
  classNames?: ModalClassNames
  // Custom close icon.
  closeIcon?: ReactNode
  // A custom loader to display in the modals, such as enabling the wallet.
  renderLoader?: () => ReactNode
  // Shows the enabling modal on autoconnect. The default behavior is to hide it
  // on autoconnect, since most times it will silently succeed from a previous
  // connection, and the enabling modal is distracting during first page load.
  showConnectingModalOnAutoconnect?: boolean
}

type UiProps = {
  // Wallets available to connect to.
  wallets: Wallet[]
  // Initiate connection to a wallet.
  connectToWallet: (wallet: Wallet) => Promise<void>
  // When status is AttemptingAutoConnect or Connecting, and this is defined,
  // the UI should be prompting to connect to WalletConnect.
  walletConnectUri?: string
  // Disconnect. This closes the default UI.
  disconnect: () => void
  // Reset connection processs in case it got stuck, reconnecting to the same
  // wallet that is currently being connected or reloading the page if no wallet
  // is being connected to.
  reset: () => Promise<void>
  // The current connection status.
  status: WalletConnectionStatus
  // The wallet being connected to, if status is AttemptingAutoConnect or
  // Connecting, or that was most recently attempted to be connected to. This
  // should be set right after `connectToWallet` is called. This is never unset,
  // so the UI can display the wallet that was most recently attempted to be
  // connected to, which helps determine which wallet the error corresponds to.
  connectingWallet?: Wallet
  // The wallet currently connected, if status is Connected.
  connectedWallet?: ConnectedWallet
  // The error that occurred on the most recent connection attempt. This
  // corresponds to the wallet in `connectingWallet`.
  error?: unknown
  // Passed through the provider.
  defaultUiConfig?: DefaultUiConfig
}
```
