# Address-neighbor seed generation

`crashlab_core::generate_address_neighbors` returns a deterministic set of 15
named key-boundary and account/contract/muxed type substitutions for a
structurally valid address. `generate_address_vectors` includes those values
next to each valid address, making them available to callers that seed a
campaign from the address corpus.

Each neighbor keeps both the expected address type and the generated type so a
type-directed caller can distinguish an intentional cross-type test from an
unconstrained decode failure. The existing address encoder is a fuzzing helper
with a deterministic CRC-like tail; production checksum validation and
decode-to-contract reachability remain the responsibility of the Soroban/XDR
integration layer.
