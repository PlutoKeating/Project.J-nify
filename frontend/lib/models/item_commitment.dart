/// `ItemCommitment` 的 Dart 模型，对应后端 /v1/items 返回的字段
/// （SPEC §4.5 原型字段 -> 真实模型字段映射）。
class ItemCommitment {
  ItemCommitment({
    required this.id,
    required this.title,
    required this.rawText,
    required this.category,
    required this.status,
    required this.importance,
    required this.urgency,
    required this.abandonCost,
    required this.estMinutes,
    this.dueAt,
    required this.createdAt,
    required this.updatedAt,
    this.closedAt,
  });

  final String id;
  final String title;
  final String rawText;
  final String category;
  final String status;
  final int importance;
  final int urgency;
  final int abandonCost;
  final int estMinutes;
  final DateTime? dueAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? closedAt;

  factory ItemCommitment.fromJson(Map<String, dynamic> json) {
    return ItemCommitment(
      id: json['id'] as String,
      title: json['title'] as String,
      rawText: json['raw_text'] as String? ?? '',
      category: json['category'] as String? ?? 'life',
      status: json['status'] as String,
      importance: json['importance'] as int? ?? 3,
      urgency: json['urgency'] as int? ?? 3,
      abandonCost: json['abandon_cost'] as int? ?? 0,
      estMinutes: json['est_minutes'] as int? ?? 10,
      dueAt: json['due_at'] == null ? null : DateTime.tryParse(json['due_at'] as String),
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? '') ?? DateTime.now(),
      closedAt: json['closed_at'] == null ? null : DateTime.tryParse(json['closed_at'] as String),
    );
  }
}
