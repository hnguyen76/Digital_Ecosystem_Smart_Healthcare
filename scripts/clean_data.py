"""Clean and enrich the Smart Healthcare dataset.

The script uses only the Python standard library so recruiters can run it
without installing project dependencies.
"""

from __future__ import annotations

import csv
import json
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DATASET = PROJECT_ROOT / "digital_ecosystem_smart_healthcare_dataset.csv"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
CLEAN_DATASET = PROCESSED_DIR / "smart_healthcare_cleaned.csv"
QUALITY_REPORT = PROCESSED_DIR / "data_quality_report.json"


@dataclass(frozen=True)
class NumericRule:
    minimum: float
    maximum: float
    decimals: int


NUMERIC_RULES: dict[str, NumericRule] = {
    "Heart_Rate": NumericRule(30, 220, 0),
    "Blood_Pressure": NumericRule(60, 240, 0),
    "Blood_Oxygen_Level": NumericRule(70, 100, 2),
    "Body_Temperature": NumericRule(32, 43, 2),
    "Respiration_Rate": NumericRule(5, 60, 0),
    "Glucose_Level": NumericRule(40, 400, 0),
    "ECG_Signal_Intensity": NumericRule(0, 5, 3),
    "Activity_Level": NumericRule(0, 100, 0),
    "Sleep_Duration_Hours": NumericRule(0, 16, 2),
    "Stress_Index": NumericRule(0, 100, 0),
    "IoT_Device_Connectivity": NumericRule(0, 100, 0),
    "EHR_Data_Completeness": NumericRule(0, 100, 0),
    "Wearable_Device_Count": NumericRule(0, 10, 0),
    "Daily_Steps": NumericRule(0, 30000, 0),
    "Healthcare_Network_Latency_ms": NumericRule(0, 1000, 0),
    "Cloud_Data_Transfer_Rate": NumericRule(0, 150, 2),
    "Medical_Alert_Frequency": NumericRule(0, 50, 0),
}

STATUS_LABELS = {
    "critical": "Critical",
    "high_risk": "High_Risk",
    "moderate_risk": "Moderate_Risk",
    "stable": "Stable",
}

STATUS_SEVERITY = {
    "Critical": 4,
    "High_Risk": 3,
    "Moderate_Risk": 2,
    "Stable": 1,
}


def main() -> None:
    raw_rows = read_csv(RAW_DATASET)
    missing_before = count_missing(raw_rows)
    unique_rows, duplicates_removed = remove_duplicates(raw_rows)
    medians = calculate_medians(unique_rows)

    cleaned_rows: list[dict[str, str]] = []
    imputations = {column: 0 for column in NUMERIC_RULES}
    out_of_range_values = {column: 0 for column in NUMERIC_RULES}
    invalid_status_count = 0

    for index, row in enumerate(unique_rows, start=1):
        cleaned: dict[str, str] = {}
        cleaned["Patient_Record_ID"] = f"SH-{index:04d}"

        for column, value in row.items():
            if column in NUMERIC_RULES:
                parsed = parse_float(value)
                if parsed is None:
                    parsed = medians[column]
                    imputations[column] += 1

                rule = NUMERIC_RULES[column]
                if parsed < rule.minimum or parsed > rule.maximum:
                    parsed = clamp(parsed, rule.minimum, rule.maximum)
                    out_of_range_values[column] += 1

                cleaned[column] = format_number(parsed, rule.decimals)
            elif column == "Patient_Health_Status":
                status = normalize_status(value)
                if status is None:
                    status = "Moderate_Risk"
                    invalid_status_count += 1
                cleaned[column] = status
            else:
                cleaned[column] = value.strip()

        numeric_record = {column: float(cleaned[column]) for column in NUMERIC_RULES}
        status = cleaned["Patient_Health_Status"]
        risk_score = calculate_risk_score(numeric_record, status)
        readiness_score = calculate_digital_readiness(numeric_record)

        cleaned["Risk_Score"] = format_number(risk_score, 1)
        cleaned["Digital_Readiness_Score"] = format_number(readiness_score, 1)
        cleaned["High_Acuity_Flag"] = "Yes" if status in {"Critical", "High_Risk"} else "No"
        cleaned_rows.append(cleaned)

    write_csv(CLEAN_DATASET, cleaned_rows)
    write_quality_report(
        {
            "raw_dataset": RAW_DATASET.name,
            "clean_dataset": CLEAN_DATASET.relative_to(PROJECT_ROOT).as_posix(),
            "raw_records": len(raw_rows),
            "clean_records": len(cleaned_rows),
            "duplicates_removed": duplicates_removed,
            "missing_values_before_cleaning": missing_before,
            "numeric_imputations": remove_zero_counts(imputations),
            "out_of_range_values_clamped": remove_zero_counts(out_of_range_values),
            "invalid_status_values_replaced": invalid_status_count,
            "status_distribution": status_distribution(cleaned_rows),
            "created_by": "Hieu Nguyen",
        }
    )

    print(f"Cleaned {len(cleaned_rows):,} records")
    print(f"Wrote {CLEAN_DATASET.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {QUALITY_REPORT.relative_to(PROJECT_ROOT)}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys()) if rows else []
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_quality_report(report: dict[str, object]) -> None:
    QUALITY_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with QUALITY_REPORT.open("w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)
        file.write("\n")


def remove_duplicates(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    seen: set[tuple[tuple[str, str], ...]] = set()
    unique_rows: list[dict[str, str]] = []

    for row in rows:
        signature = tuple(sorted((key, value.strip()) for key, value in row.items()))
        if signature in seen:
            continue
        seen.add(signature)
        unique_rows.append(row)

    return unique_rows, len(rows) - len(unique_rows)


def count_missing(rows: list[dict[str, str]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        for column, value in row.items():
            if value.strip() == "":
                counts[column] = counts.get(column, 0) + 1
    return counts


def calculate_medians(rows: list[dict[str, str]]) -> dict[str, float]:
    medians: dict[str, float] = {}

    for column, rule in NUMERIC_RULES.items():
        values = [
            parsed
            for row in rows
            if (parsed := parse_float(row.get(column, ""))) is not None
            and rule.minimum <= parsed <= rule.maximum
        ]
        medians[column] = statistics.median(values) if values else 0.0

    return medians


def parse_float(value: str) -> float | None:
    try:
        return float(value.strip())
    except (TypeError, ValueError):
        return None


def normalize_status(value: str) -> str | None:
    key = value.strip().lower().replace(" ", "_").replace("-", "_")
    return STATUS_LABELS.get(key)


def status_distribution(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = {status: 0 for status in STATUS_SEVERITY}
    for row in rows:
        counts[row["Patient_Health_Status"]] += 1
    return counts


def calculate_risk_score(record: dict[str, float], status: str) -> float:
    vitals = (
        deviation(record["Heart_Rate"], 60, 100, 30, 220) * 11
        + deviation(record["Blood_Pressure"], 90, 130, 60, 240) * 12
        + deviation(record["Blood_Oxygen_Level"], 95, 100, 70, 100) * 13
        + deviation(record["Body_Temperature"], 36.1, 37.5, 32, 43) * 9
        + deviation(record["Respiration_Rate"], 12, 20, 5, 60) * 9
        + deviation(record["Glucose_Level"], 70, 140, 40, 400) * 8
    )
    lifestyle = (
        normalize_high(record["Stress_Index"], 0, 100) * 8
        + normalize_low(record["Sleep_Duration_Hours"], 0, 16) * 5
        + normalize_low(record["Daily_Steps"], 0, 30000) * 4
    )
    operations = (
        normalize_high(record["Medical_Alert_Frequency"], 0, 50) * 10
        + normalize_low(record["EHR_Data_Completeness"], 0, 100) * 5
        + normalize_high(record["Healthcare_Network_Latency_ms"], 0, 1000) * 4
    )

    return clamp(STATUS_SEVERITY[status] * 12 + vitals + lifestyle + operations, 0, 100)


def calculate_digital_readiness(record: dict[str, float]) -> float:
    wearable_score = clamp((record["Wearable_Device_Count"] / 10) * 100, 0, 100)
    scores = [
        record["IoT_Device_Connectivity"],
        record["EHR_Data_Completeness"],
        record["Cloud_Data_Transfer_Rate"],
        wearable_score,
    ]
    return sum(scores) / len(scores)


def deviation(value: float, ideal_low: float, ideal_high: float, observed_low: float, observed_high: float) -> float:
    if ideal_low <= value <= ideal_high:
        return 0
    if value < ideal_low:
        return clamp((ideal_low - value) / max(ideal_low - observed_low, 1), 0, 1)
    return clamp((value - ideal_high) / max(observed_high - ideal_high, 1), 0, 1)


def normalize_high(value: float, minimum: float, maximum: float) -> float:
    return clamp((value - minimum) / max(maximum - minimum, 1), 0, 1)


def normalize_low(value: float, minimum: float, maximum: float) -> float:
    return 1 - normalize_high(value, minimum, maximum)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def format_number(value: float, decimals: int) -> str:
    if decimals == 0:
        return str(int(round(value)))
    return f"{value:.{decimals}f}"


def remove_zero_counts(counts: dict[str, int]) -> dict[str, int]:
    return {key: value for key, value in counts.items() if value}


if __name__ == "__main__":
    main()
