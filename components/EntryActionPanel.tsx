import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Lock,
  PencilSimple,
  Trash,
  Users,
} from 'phosphor-react-native';
import { Entry } from '../lib/db';
import { COLORS } from '../lib/theme';

type EntryActionPanelProps = {
  entry: Entry;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
};

export function EntryActionPanel({
  entry,
  onEdit,
  onToggleVisibility,
  onDelete,
}: EntryActionPanelProps) {
  const nextIsShared = entry.visibility === 'private';
  const visibilityLabel = nextIsShared ? 'ふたりへ共有' : '自分のみにする';

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.editButton} onPress={onEdit} activeOpacity={0.65}
        accessibilityLabel="投稿を編集" accessibilityRole="button">
        <PencilSimple size={15} color="#555" weight="regular" />
        <Text style={styles.editButtonText}>編集</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.visibilityButton,
          nextIsShared ? styles.sharedButton : styles.privateButton,
        ]}
        onPress={onToggleVisibility}
        activeOpacity={0.65}
        accessibilityLabel={visibilityLabel}
        accessibilityRole="button"
      >
        {nextIsShared ? (
          <Users size={15} color="#7B9E87" weight="fill" />
        ) : (
          <Lock size={15} color="#555" weight="fill" />
        )}
        <Text
          style={[
            styles.visibilityButtonText,
            nextIsShared ? styles.sharedButtonText : styles.privateButtonText,
          ]}
        >
          {visibilityLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={onDelete} activeOpacity={0.65}
        accessibilityLabel="投稿を削除" accessibilityRole="button">
        <Trash size={15} color="#E57373" weight="regular" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 18,
    marginTop: -4,
    marginBottom: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: COLORS.background,
  },
  editButtonText: { fontSize: 12, color: COLORS.textSubtle, fontWeight: '700' },
  visibilityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sharedButton: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primaryDim,
  },
  privateButton: {
    backgroundColor: COLORS.borderSoft,
    borderColor: COLORS.border,
  },
  visibilityButtonText: { fontSize: 12, fontWeight: '700' },
  sharedButtonText: { color: COLORS.primary },
  privateButtonText: { color: COLORS.textSubtle },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
});
