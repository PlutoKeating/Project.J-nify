/// `ItemCommitment` 的 Dart 模型，对应后端 /v1/items 返回的字段
/// （SPEC §4.5 原型字段 -> 真实模型字段映射）。
class ItemCommitment {
  /// 供纯 widget 测试与本地构造使用；线上数据仍走 [ItemCommitment.fromJson]。
  const ItemCommitment({
    required this.id,
    required this.title,
    this.rawText = '',
    this.category = 'life',
    this.status = 'parked',
    this.reasonText,
    this.importance = 1,
    this.urgency = 1,
    this.abandonCost = 0,
    this.estMinutes = 5,
    this.dueAt,
    this.options = const [],
    this.createdAt,
    this.updatedAt,
    this.closedAt,
  });

  final String id;
  final String title;
  final String rawText;
  final String category;
  final String status;
  final String? reasonText;
  final int importance;
  final int urgency;
  final int abandonCost;
  final int estMinutes;
  final DateTime? dueAt;

  /// NowItem 的决策选项数组（code/label/action_type），/v1/now 下发；
  /// 供 FocusCard 按后端 options 渲染决策按钮。
  final List<dynamic> options;

  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? closedAt;

  factory ItemCommitment.fromJson(Map<String, dynamic> json) {
    return ItemCommitment(
      id: json['id'] as String,
      title: json['title'] as String,
      rawText: json['raw_text'] as String? ?? '',
      category: json['category'] as String? ?? 'life',
      status: json['status'] as String,
      reasonText: json['reason_text'] as String?,
      importance: json['importance'] as int? ?? 3,
      urgency: json['urgency'] as int? ?? 3,
      abandonCost: json['abandon_cost'] as int? ?? 0,
      estMinutes: json['est_minutes'] as int? ?? 10,
      dueAt: json['due_at'] == null
          ? null
          : DateTime.tryParse(json['due_at'] as String),
      options: (json['options'] as List<dynamic>? ?? []),
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? '') ??
          DateTime.now(),
      closedAt: json['closed_at'] == null
          ? null
          : DateTime.tryParse(json['closed_at'] as String),
    );
  }
}
