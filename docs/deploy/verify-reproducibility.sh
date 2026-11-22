#!/bin/sh
# Reproducible recompilation of SplitFlow.sol — matches the deployed Forge artifact exactly.
# Run from the project root on any machine with solc 0.8.28 installed.
# Output bytecode must match: creation SHA256 = 0e2be52d87fc5a14bb15485e488fb1f871197ae01573eeba33cb7f859c05c2b0
#                              deployed SHA256 = 74e87d8e24e7c73b7787931fc74154659e78613ea9ef874d511f95aab56ebf04

solc \
  --standard-json \
  --base-path . \
  --allow-paths .,./lib \
  docs/deploy/SplitFlow.standard-input.json \
  > /tmp/splitflow-recompile-output.json

# Extract and verify deployed bytecode hash
python3 -c "
import json, hashlib, sys
with open('/tmp/splitflow-recompile-output.json') as f:
    out = json.load(f)
errs = [e for e in out.get('errors',[]) if e.get('severity')=='error']
if errs:
    print('ERRORS:', [e['message'] for e in errs]); sys.exit(1)
for fname, fcs in out.get('contracts',{}).items():
    if 'SplitFlow' in fcs:
        c = fcs['SplitFlow']
        c_sha = hashlib.sha256(bytes.fromhex(c['evm']['bytecode']['object'])).hexdigest()
        d_sha = hashlib.sha256(bytes.fromhex(c['evm']['deployedBytecode']['object'])).hexdigest()
        expected_c = '0e2be52d87fc5a14bb15485e488fb1f871197ae01573eeba33cb7f859c05c2b0'
        expected_d = '74e87d8e24e7c73b7787931fc74154659e78613ea9ef874d511f95aab56ebf04'
        print(f'Creation SHA256: {c_sha}  MATCH={c_sha==expected_c}')
        print(f'Deployed SHA256: {d_sha}  MATCH={d_sha==expected_d}')
        if c_sha==expected_c and d_sha==expected_d:
            print('REPRODUCIBILITY VERIFIED')
        else:
            print('MISMATCH — do not deploy'); sys.exit(1)
"
