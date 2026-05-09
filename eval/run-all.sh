#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "===== aiConsult eval 全ケース実行開始 ====="
echo "開始時刻: $(date)"

CASES=(case-01 case-02 case-03 case-04 case-05 case-06a case-06b case-06c case-07 case-08)

for CASE in "${CASES[@]}"; do
  echo ""
  echo "----- $CASE -----"
  npx tsx run.ts A "$CASE" &
  PID_A=$!
  npx tsx run.ts B "$CASE" &
  PID_B=$!
  wait $PID_A $PID_B
  echo "$CASE 完了"
done

echo ""
echo "===== 全ケース完了 ====="
echo "終了時刻: $(date)"
echo "CSV: eval/results/all_results.csv"
echo "JSON: eval/results/"
